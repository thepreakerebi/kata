import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { merchants, messages } from "@/db/schema";
import { extractFacts } from "@/memory/extract";
import { writeFacts, type WrittenMemory } from "@/memory/write";

/**
 * The single ingest path. WhatsApp and the dashboard simulator both land
 * here — same extraction, same gate, same store. Channel is metadata.
 * Messages without text (media-only, until OCR import lands) are logged
 * for provenance but skip extraction.
 */
export async function ingestMessage(input: {
  merchantId: string;
  channel: "whatsapp" | "simulator";
  direction?: "inbound" | "outbound";
  chatJid: string;
  senderJid: string;
  body: string | null;
  sentAt: Date;
  waMessageId?: string;
  mediaS3Key?: string;
  mediaType?: string;
}): Promise<{ messageId: string; written: WrittenMemory[] }> {
  const [message] = await db
    .insert(messages)
    .values({
      merchantId: input.merchantId,
      channel: input.channel,
      direction: input.direction ?? "inbound",
      chatJid: input.chatJid,
      senderJid: input.senderJid,
      body: input.body,
      sentAt: input.sentAt,
      waMessageId: input.waMessageId ?? null,
      mediaS3Key: input.mediaS3Key ?? null,
      mediaType: input.mediaType ?? null,
    })
    .returning({ id: messages.id });

  if (!input.body?.trim()) {
    return { messageId: message!.id, written: [] };
  }

  const facts = await extractFacts({ body: input.body, sentAt: input.sentAt });
  const written = await writeFacts({
    merchantId: input.merchantId,
    sourceMessageId: message!.id,
    facts,
  });

  return { messageId: message!.id, written };
}

const DEMO_MERCHANT_NAME = "Demo Merchant";

/** Dev/demo merchant used by the simulator until real onboarding exists. */
export async function getOrCreateDemoMerchant(): Promise<string> {
  const [existing] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.name, DEMO_MERCHANT_NAME))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(merchants)
    .values({ name: DEMO_MERCHANT_NAME })
    .returning({ id: merchants.id });
  return created!.id;
}
