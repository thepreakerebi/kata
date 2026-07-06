import {
  DisconnectReason,
  downloadMediaMessage,
  isJidBroadcast,
  isJidStatusBroadcast,
  jidNormalizedUser,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { merchants } from "@/db/schema";
import { env } from "@/env";
import { getOrCreateDemoMerchant, ingestMessage } from "@/ingest/ingest";
import { uploadMedia } from "@/media/s3";
import { importNotebookPhoto } from "@/memory/import-notebook";
import { recall } from "@/memory/recall";

/**
 * WhatsApp adapter (Baileys, long-lived socket). The merchant's own account
 * is the interface:
 * - customer/supplier chats: both directions ingest into memory
 * - the "message yourself" chat is the merchant console — text ending in
 *   "?" runs recall and Kata replies there; anything else ingests as a
 *   note-to-self
 * Kata never messages customers (self-chat replies only).
 */
export async function startWhatsApp(): Promise<void> {
  if (!env.WA_ENABLED) {
    console.log("whatsapp: disabled (set WA_ENABLED=true to pair)");
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(env.WA_AUTH_DIR);

  // Default history sync stays on (Baileys v7 needs it for LID mappings);
  // replayed history arrives as non-"notify" upserts, which the message
  // handler ignores — Kata remembers from the moment it is connected.
  const socket = makeWASocket({ auth: state });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", (update) => {
    if (update.qr) {
      console.log("whatsapp: scan this QR with the merchant's phone:");
      qrcode.generate(update.qr, { small: true });
    }
    if (update.connection === "open") {
      console.log("whatsapp: connected");
      void bindMerchant(socket.user?.id);
    }
    if (update.connection === "close") {
      const statusCode = (
        update.lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined
      )?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error(
          "whatsapp: logged out — delete the auth directory and re-pair",
        );
        return;
      }
      console.log("whatsapp: connection closed, reconnecting…");
      void startWhatsApp();
    }
  });

  socket.ev.on("messages.upsert", ({ messages: batch, type }) => {
    if (type !== "notify") return;
    for (const message of batch) {
      handleMessage(socket, message).catch((error) => {
        // Log hygiene: never include message bodies or JIDs.
        console.error("whatsapp: message handling failed:", (error as Error).message);
      });
    }
  });
}

async function bindMerchant(rawJid: string | undefined): Promise<void> {
  if (!rawJid) return;
  const waJid = jidNormalizedUser(rawJid);
  const merchantId = await getOrCreateDemoMerchant();
  await db
    .update(merchants)
    .set({ waJid })
    .where(eq(merchants.id, merchantId));
}

type Socket = ReturnType<typeof makeWASocket>;

async function handleMessage(
  socket: Socket,
  message: WAMessage,
): Promise<void> {
  const chatJid = message.key.remoteJid;
  if (!chatJid || isJidBroadcast(chatJid) || isJidStatusBroadcast(chatJid)) {
    return;
  }
  const content = message.message;
  if (!content) return;

  const ownJid = socket.user?.id ? jidNormalizedUser(socket.user.id) : null;
  const fromMe = message.key.fromMe === true;
  const isSelfChat = ownJid !== null && jidNormalizedUser(chatJid) === ownJid;

  const text =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    null;

  const merchantId = await getOrCreateDemoMerchant();
  const sentAt = message.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();

  // Merchant console: questions get answered in place.
  if (isSelfChat && fromMe && text?.trim().endsWith("?")) {
    const result = await recall({ merchantId, question: text.trim() });
    await socket.sendMessage(chatJid, { text: result.answer });
    return;
  }

  // Merchant console: a photo sent to yourself is a notebook page import.
  if (isSelfChat && fromMe && content.imageMessage) {
    const buffer = await downloadMediaMessage(message, "buffer", {});
    const result = await importNotebookPhoto({
      merchantId,
      imageBase64: Buffer.from(buffer).toString("base64"),
      mimeType: content.imageMessage.mimetype ?? "image/jpeg",
      channel: "whatsapp",
      chatJid,
      senderJid: ownJid ?? "me",
      waMessageId: message.key.id ?? undefined,
    });
    const committed = result.written.filter((m) => m.status === "active");
    const pending = result.written.filter((m) => m.status === "pending");
    const summary =
      result.written.length === 0
        ? "I could not read any business records from that photo."
        : `Notebook imported: ${committed.length} fact${committed.length === 1 ? "" : "s"} saved` +
          (pending.length > 0
            ? `, ${pending.length} waiting for your confirmation on the dashboard.`
            : ".");
    await socket.sendMessage(chatJid, { text: summary });
    return;
  }

  // Media: stage privately in S3, keep only the object key.
  let mediaS3Key: string | undefined;
  let mediaType: string | undefined;
  if (content.imageMessage) {
    const buffer = await downloadMediaMessage(message, "buffer", {});
    const key = `media/${merchantId}/${message.key.id ?? crypto.randomUUID()}.jpg`;
    const uploaded = await uploadMedia({
      key,
      body: buffer,
      contentType: content.imageMessage.mimetype ?? "image/jpeg",
    });
    if (uploaded) {
      mediaS3Key = uploaded;
      mediaType = content.imageMessage.mimetype ?? "image/jpeg";
    }
  }

  if (!text && !mediaS3Key) return;

  const senderJid = fromMe
    ? (ownJid ?? "me")
    : (message.key.participant ?? chatJid);

  await ingestMessage({
    merchantId,
    channel: "whatsapp",
    direction: fromMe ? "outbound" : "inbound",
    chatJid,
    senderJid,
    body: text,
    sentAt,
    waMessageId: message.key.id ?? undefined,
    mediaS3Key,
    mediaType,
  });
}
