import { z } from "zod";
import { db } from "@/db/client";
import { messages } from "@/db/schema";
import { completeVisionJson } from "@/llm/vision";
import { uploadMedia } from "@/media/s3";
import { extractedFactsFromRaw, type ExtractedFact } from "./extract";
import { writeFacts, type WrittenMemory } from "./write";

const SYSTEM_PROMPT = `You read a photo of a merchant's paper business notebook (a ledger page: names, goods, amounts, dates, payment marks). Handwriting may be messy and mix English with Pidgin or abbreviations.

Return JSON {"facts": [...]} where each fact follows exactly this shape:
- "class": "ledger" for money owed/paid; "semantic" for durable customer/product facts; "episodic" for dated one-off events.
- "content": one self-contained sentence stating the fact, with names, amounts, and dates written out.
- "confidence": 0 to 1 — lower it for hard-to-read handwriting, ambiguous names, or unclear amounts. Be honest: uncertain rows go to the merchant for confirmation, and a wrong amount is worse than a skipped row.
- "structured": optional typed payload.
- "entities": people/products in the fact, each {"kind": "customer"|"supplier"|"product"|"other", "name", "role": "subject"|"object"|"counterparty"}.
- "ledger": ONLY for class "ledger": {"kind": "debt"|"payment"|"credit", "amount": number|null, "currency": 3-letter code or null (assume NGN when the page shows naira or no currency), "dueDate": "YYYY-MM-DD"|null, "counterparty": name|null}. Resolve day/month dates like "15/7" using the current year. A row fully marked PAID or crossed out is a completed sale: record it as class "episodic" with NO ledger payload — only unpaid balances and partial payments belong on the ledger. A partial payment row yields the payment (kind "payment") and, if the outstanding balance is written, the remaining debt.

Read every row you can. Skip decorations, headers, and unreadable rows entirely rather than guessing. If the image is not a notebook/ledger page, return {"facts": []}.`;

const visionResultSchema = z.object({
  facts: z.array(z.unknown()).default([]),
});

/**
 * Import a paper-notebook photo: archive the image in S3, log a provenance
 * message, run vision extraction, and push every row through the same
 * confidence gate as chat. Low-confidence rows land in the confirmation
 * queue — a blurry line never silently corrupts the ledger.
 */
export async function importNotebookPhoto(input: {
  merchantId: string;
  imageBase64: string;
  mimeType: string;
  channel: "whatsapp" | "simulator";
  chatJid: string;
  senderJid: string;
  waMessageId?: string;
}): Promise<{ messageId: string; written: WrittenMemory[] }> {
  const bytes = Uint8Array.from(Buffer.from(input.imageBase64, "base64"));
  const extension = input.mimeType === "image/png" ? "png" : "jpg";
  const mediaS3Key = await uploadMedia({
    key: `notebook/${input.merchantId}/${crypto.randomUUID()}.${extension}`,
    body: bytes,
    contentType: input.mimeType,
  });

  const [message] = await db
    .insert(messages)
    .values({
      merchantId: input.merchantId,
      channel: input.channel,
      direction: "inbound",
      chatJid: input.chatJid,
      senderJid: input.senderJid,
      body: "[notebook photo import]",
      sentAt: new Date(),
      waMessageId: input.waMessageId ?? null,
      mediaS3Key,
      mediaType: input.mimeType,
    })
    .returning({ id: messages.id });

  const raw = await completeVisionJson({
    system: SYSTEM_PROMPT,
    user: "Read this notebook page and extract the facts as JSON.",
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
    schema: visionResultSchema,
  });

  const facts: ExtractedFact[] = extractedFactsFromRaw(raw.facts);
  const written = await writeFacts({
    merchantId: input.merchantId,
    sourceMessageId: message!.id,
    facts,
  });

  return { messageId: message!.id, written };
}
