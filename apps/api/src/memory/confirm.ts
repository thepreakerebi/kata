import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { memories } from "@/db/schema";
import { embed } from "@/llm/client";
import { createLedgerEntry, type LedgerPayload } from "./ledger";

export const confirmCorrectionsSchema = z.object({
  content: z.string().min(1).max(1000).optional(),
  ledger: z
    .object({
      kind: z.enum(["debt", "payment", "credit"]),
      amount: z.number().positive(),
      currency: z
        .string()
        .length(3)
        .transform((value) => value.toUpperCase())
        .default("NGN"),
      dueDate: z.iso.date().nullish(),
      counterparty: z.string().min(1).max(200),
    })
    .optional(),
});

export type ConfirmCorrections = z.infer<typeof confirmCorrectionsSchema>;

const storedLedgerSchema = z.object({
  kind: z.enum(["debt", "payment", "credit"]),
  amount: z.number().positive(),
  currency: z.string().length(3),
  dueDate: z.iso.date().nullable(),
  counterparty: z.string().min(1),
});

type ConfirmResult =
  | { ok: true; status: "active"; ledgerEntryId: string | null }
  | { ok: false; error: "not_found" | "not_pending" };

/**
 * Merchant confirms a pending fact, optionally correcting it. Corrections
 * re-embed the content; money facts get their ledger entry created from the
 * corrected (or originally extracted) payload. Confirmation closes the
 * confidence-gate loop.
 */
export async function confirmMemory(input: {
  merchantId: string;
  memoryId: string;
  corrections?: ConfirmCorrections;
}): Promise<ConfirmResult> {
  const [memory] = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.id, input.memoryId),
        eq(memories.merchantId, input.merchantId),
      ),
    )
    .limit(1);

  if (!memory) return { ok: false, error: "not_found" };
  if (memory.status !== "pending") return { ok: false, error: "not_pending" };

  const content = input.corrections?.content ?? memory.content;
  const contentChanged = content !== memory.content;
  const newEmbedding = contentChanged ? await embed(content) : null;

  // Ledger payload priority: merchant corrections > what extraction stored.
  let ledger: LedgerPayload | null = null;
  if (memory.class === "ledger") {
    if (input.corrections?.ledger) {
      ledger = {
        ...input.corrections.ledger,
        dueDate: input.corrections.ledger.dueDate ?? null,
      };
    } else {
      const stored = storedLedgerSchema.safeParse(
        (memory.structured as Record<string, unknown> | null)?.["_ledger"],
      );
      if (stored.success) ledger = stored.data;
    }
  }

  const ledgerEntryId = await db.transaction(async (tx) => {
    let entryId: string | null = null;
    if (ledger) {
      entryId = await createLedgerEntry(tx, {
        merchantId: input.merchantId,
        ledger,
        note: content,
        sourceMessageId: memory.sourceMessageId,
      });
    }

    await tx
      .update(memories)
      .set({
        status: "active",
        content,
        ...(newEmbedding ? { embedding: newEmbedding } : {}),
        pinned: ledger?.kind === "debt",
        ledgerEntryId: entryId,
        confidence: 1,
        confirmedAt: new Date(),
        confirmedVia: input.corrections ? "corrected" : "merchant",
        updatedAt: new Date(),
      })
      .where(eq(memories.id, memory.id));

    return entryId;
  });

  return { ok: true, status: "active", ledgerEntryId };
}

/**
 * Merchant rejects a pending fact. Forgetting is demotion, never deletion:
 * the row archives with its provenance intact.
 */
export async function rejectMemory(input: {
  merchantId: string;
  memoryId: string;
}): Promise<{ ok: boolean }> {
  const updated = await db
    .update(memories)
    .set({
      status: "archived",
      salience: 0,
      confirmedAt: new Date(),
      confirmedVia: "rejected",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(memories.id, input.memoryId),
        eq(memories.merchantId, input.merchantId),
        eq(memories.status, "pending"),
      ),
    )
    .returning({ id: memories.id });
  return { ok: updated.length > 0 };
}
