import { z } from "zod";
import { completeJson } from "@/llm/client";

/**
 * Boundary schemas for extractor output. LLM output is untrusted, so the
 * boundary degrades gracefully instead of erroring: unknown entity kinds
 * become "other", unknown roles become "subject", and incomplete money facts
 * lose their ledger payload and get confidence-capped so the gate routes
 * them to merchant confirmation.
 */
const rawEntitySchema = z.object({
  kind: z.enum(["customer", "supplier", "product", "other"]).catch("other"),
  name: z.string().min(1).max(200),
  role: z.enum(["subject", "object", "counterparty"]).catch("subject"),
});

const rawLedgerSchema = z.object({
  kind: z.enum(["debt", "payment", "credit"]),
  amount: z.number().positive().nullish(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase())
    .nullish(),
  dueDate: z.iso.date().nullish(),
  counterparty: z.string().min(1).max(200).nullish(),
});

// A malformed entity (missing name, wrong shape) drops silently — one bad
// item must never reject the whole extraction.
const lenientEntities = z
  .array(z.unknown())
  .default([])
  .transform((items) =>
    items.slice(0, 10).flatMap((item) => {
      const parsed = rawEntitySchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

const rawFactSchema = z.object({
  class: z.enum(["episodic", "semantic", "procedural", "ledger"]),
  content: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  structured: z.record(z.string(), z.unknown()).nullish(),
  entities: lenientEntities,
  ledger: rawLedgerSchema.nullish(),
});

// Same leniency per fact: keep every fact that parses, shed the rest.
function parseFactsLeniently(
  items: unknown[],
  limit = 20,
): z.infer<typeof rawFactSchema>[] {
  return items.slice(0, limit).flatMap((item) => {
    const parsed = rawFactSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const rawExtractionSchema = z.object({
  facts: z
    .array(z.unknown())
    .default([])
    .transform((items) => parseFactsLeniently(items)),
});

export type ExtractedFact = {
  class: "episodic" | "semantic" | "procedural" | "ledger";
  content: string;
  confidence: number;
  structured: Record<string, unknown> | null;
  entities: { kind: "customer" | "supplier" | "product" | "other"; name: string; role: "subject" | "object" | "counterparty" }[];
  ledger: {
    kind: "debt" | "payment" | "credit";
    amount: number;
    currency: string;
    dueDate: string | null;
    counterparty: string;
  } | null;
};

/**
 * A money fact missing its amount or counterparty cannot become a ledger
 * entry — it keeps class "ledger" but drops the payload and gets its
 * confidence capped below the gate, so it always queues for confirmation.
 */
const INCOMPLETE_LEDGER_CONFIDENCE_CAP = 0.5;

function normalizeFact(raw: z.infer<typeof rawFactSchema>): ExtractedFact {
  const base = {
    class: raw.class,
    content: raw.content,
    confidence: raw.confidence,
    structured: raw.structured ?? null,
    entities: raw.entities,
  };

  if (raw.class !== "ledger") {
    return { ...base, ledger: null };
  }

  const ledger = raw.ledger;
  if (!ledger || ledger.amount == null || !ledger.counterparty) {
    return {
      ...base,
      confidence: Math.min(raw.confidence, INCOMPLETE_LEDGER_CONFIDENCE_CAP),
      ledger: null,
    };
  }

  return {
    ...base,
    ledger: {
      kind: ledger.kind,
      amount: ledger.amount,
      currency: ledger.currency ?? "NGN",
      dueDate: ledger.dueDate ?? null,
      counterparty: ledger.counterparty,
    },
  };
}

const SYSTEM_PROMPT = `You extract business facts from a merchant's chat messages. The merchant runs a small business over WhatsApp: customers, orders, informal credit ("book me down, I'll pay Friday"), supplier quotes.

Return JSON: {"facts": [...]}. Each fact:
- "class": exactly one of "ledger" (money owed/paid/credited), "semantic" (durable facts and preferences: what a customer usually buys, a supplier's price), "procedural" (the merchant correcting or instructing the system), "episodic" (one-off events: an order placed and paid, a delivery).
- "content": one self-contained sentence stating the fact, understandable without the original message. Use names, amounts, and dates explicitly.
- "confidence": how certain the extraction is, 0 to 1. Ambiguous names, unclear amounts, or guessed intent lower it. Be honest — facts below the gate are confirmed by the merchant, and a wrong ledger amount is worse than no memory.
- "structured": optional typed payload (e.g. {"item":"rice","quantity":2,"unit_price":22500}).
- "entities": people/businesses/products the fact is about. "kind" must be exactly one of: "customer", "supplier", "product", "other". "role" must be exactly one of: "subject" (who the fact is about), "object" (what it concerns), "counterparty" (whoever owes or is owed).
- "ledger": ONLY for class "ledger": {"kind","amount","currency","dueDate","counterparty"}. "kind" is exactly "debt" (someone owes the merchant), "payment" (money received against what they owed), or "credit" (the merchant owes someone). "amount" is a number, null if the message names no amount. "currency" is a 3-letter code, null if unstated. Resolve relative dates against the message date; "dueDate" is "YYYY-MM-DD" or null. "counterparty" is the person whose account the money applies to: for a debt, who owes; for a payment, whose debt is being settled — if someone pays on another person's behalf ("Chief paid for Mama C"), the counterparty is the debtor, not the physical payer. Null if unclear.

A sale paid in full on the spot is "episodic", not a ledger fact — ledger "payment" is only money received against an existing balance.

Today's message date is provided. Messages may mix English, Pidgin, and shorthand. Extract only what the message states — never invent amounts or names. A message with nothing worth remembering yields {"facts": []}.`;

/**
 * Parse + normalize a raw facts array from any extraction source (chat,
 * notebook vision) through the same lenient boundary and money rules.
 */
export function extractedFactsFromRaw(
  items: unknown[],
  limit = 40,
): ExtractedFact[] {
  return parseFactsLeniently(items, limit).map(normalizeFact);
}

/** Extract structured facts from one message. */
export async function extractFacts(input: {
  body: string;
  sentAt: Date;
}): Promise<ExtractedFact[]> {
  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Message date: ${input.sentAt.toISOString().slice(0, 10)}\nMessage: ${input.body}`,
    schema: rawExtractionSchema,
  });
  return result.facts.map(normalizeFact);
}
