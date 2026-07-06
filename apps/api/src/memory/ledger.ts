import { and, eq } from "drizzle-orm";
import type { db } from "@/db/client";
import { entities, ledgerEntries } from "@/db/schema";

export type LedgerPayload = {
  kind: "debt" | "payment" | "credit";
  amount: number;
  currency: string;
  dueDate: string | null;
  counterparty: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find or create the customer entity a ledger entry is against. */
export async function resolveCounterparty(
  tx: Tx,
  input: { merchantId: string; name: string },
): Promise<string> {
  const normalized = normalizeName(input.name);
  const [existing] = await tx
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.merchantId, input.merchantId),
        eq(entities.kind, "customer"),
        eq(entities.normalizedName, normalized),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(entities)
    .values({
      merchantId: input.merchantId,
      kind: "customer",
      name: input.name.trim(),
      normalizedName: normalized,
    })
    .returning({ id: entities.id });
  return created!.id;
}

/** Create the transactional row backing a confirmed money fact. */
export async function createLedgerEntry(
  tx: Tx,
  input: {
    merchantId: string;
    ledger: LedgerPayload;
    note: string;
    sourceMessageId: string | null;
    counterpartyEntityId?: string;
  },
): Promise<string> {
  const counterpartyEntityId =
    input.counterpartyEntityId ??
    (await resolveCounterparty(tx, {
      merchantId: input.merchantId,
      name: input.ledger.counterparty,
    }));

  const [entry] = await tx
    .insert(ledgerEntries)
    .values({
      merchantId: input.merchantId,
      counterpartyEntityId,
      kind: input.ledger.kind,
      amount: input.ledger.amount.toFixed(2),
      currency: input.ledger.currency,
      dueDate: input.ledger.dueDate,
      note: input.note,
      sourceMessageId: input.sourceMessageId,
    })
    .returning({ id: ledgerEntries.id });
  return entry!.id;
}
