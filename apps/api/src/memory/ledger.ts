import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import { entities, ledgerEntries, memories } from "@/db/schema";

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

/**
 * Apply a payment against the counterparty's open debts, oldest first.
 * Fully covered debts settle (and their memories unpin, so "resolved
 * transactions archive" via normal decay); a partially covered debt has its
 * amount reduced to the outstanding balance. Whatever remains of the payment
 * stays open as credit on the customer's account; a fully applied payment
 * settles itself so it never shows as an open position.
 */
export async function applyPaymentToDebts(
  tx: Tx,
  input: {
    merchantId: string;
    paymentEntryId: string;
    counterpartyEntityId: string;
    amount: number;
    currency: string;
  },
): Promise<{ settledDebtIds: string[]; unappliedAmount: number }> {
  const debts = await tx
    .select({ id: ledgerEntries.id, amount: ledgerEntries.amount })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.merchantId, input.merchantId),
        eq(ledgerEntries.counterpartyEntityId, input.counterpartyEntityId),
        eq(ledgerEntries.kind, "debt"),
        eq(ledgerEntries.status, "open"),
        eq(ledgerEntries.currency, input.currency),
      ),
    )
    .orderBy(asc(ledgerEntries.createdAt));

  let remaining = input.amount;
  const settledDebtIds: string[] = [];

  for (const debt of debts) {
    if (remaining <= 0) break;
    const owed = Number(debt.amount);
    if (remaining >= owed) {
      await tx
        .update(ledgerEntries)
        .set({ status: "settled", settledAt: new Date(), updatedAt: new Date() })
        .where(eq(ledgerEntries.id, debt.id));
      settledDebtIds.push(debt.id);
      remaining -= owed;
    } else {
      await tx
        .update(ledgerEntries)
        .set({ amount: (owed - remaining).toFixed(2), updatedAt: new Date() })
        .where(eq(ledgerEntries.id, debt.id));
      remaining = 0;
    }
  }

  const applied = input.amount - remaining;
  if (applied > 0) {
    await tx
      .update(ledgerEntries)
      .set(
        remaining <= 0
          ? {
              status: "settled",
              settledAt: new Date(),
              updatedAt: new Date(),
            }
          : { amount: remaining.toFixed(2), updatedAt: new Date() },
      )
      .where(eq(ledgerEntries.id, input.paymentEntryId));
  }

  if (settledDebtIds.length > 0) {
    await tx
      .update(memories)
      .set({ pinned: false, updatedAt: new Date() })
      .where(inArray(memories.ledgerEntryId, settledDebtIds));
  }

  return { settledDebtIds, unappliedAmount: remaining };
}

/**
 * Create the transactional row backing a confirmed money fact. Payments are
 * immediately applied against the counterparty's open debts.
 */
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

  if (input.ledger.kind === "payment") {
    await applyPaymentToDebts(tx, {
      merchantId: input.merchantId,
      paymentEntryId: entry!.id,
      counterpartyEntityId,
      amount: input.ledger.amount,
      currency: input.ledger.currency,
    });
  }

  return entry!.id;
}
