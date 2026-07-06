import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const messageChannel = pgEnum("message_channel", [
  "whatsapp",
  "simulator",
]);

export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

/**
 * Raw message log — the provenance root. Every memory traces back to the
 * message it was extracted from. The simulator writes here through the exact
 * same path as WhatsApp.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    channel: messageChannel("channel").notNull(),
    direction: messageDirection("direction").notNull(),
    // Baileys message ID; null for simulator messages.
    waMessageId: text("wa_message_id"),
    chatJid: text("chat_jid").notNull(),
    senderJid: text("sender_jid").notNull(),
    body: text("body"),
    // Media lands in S3; only the object key is stored.
    mediaS3Key: text("media_s3_key"),
    mediaType: text("media_type"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_wa_message_id_key").on(table.waMessageId),
    index("messages_merchant_chat_sent_idx").on(
      table.merchantId,
      table.chatJid,
      table.sentAt,
    ),
  ],
);
