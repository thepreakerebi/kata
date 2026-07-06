import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { entities, entityEdges, memories, memoryEntities } from "@/db/schema";
import { embedMany } from "@/llm/client";
import type { ExtractedFact } from "./extract";
import { createLedgerEntry, normalizeName } from "./ledger";

/**
 * The confidence gate. Facts at or above the threshold commit as active;
 * below it they queue as pending for merchant confirmation. Ledger facts get
 * a stricter gate — a wrong debt amount is worse than no memory at all.
 */
const GATE = { default: 0.8, ledger: 0.9 } as const;

export type WrittenMemory = {
  memoryId: string;
  class: ExtractedFact["class"];
  status: "active" | "pending";
  content: string;
  confidence: number;
  ledgerEntryId: string | null;
};

/**
 * Write one message's extracted facts into the memory store, transactionally:
 * resolve entities, strengthen graph edges, gate on confidence, create ledger
 * entries for money facts, and attach provenance to the source message.
 * Embeddings are computed before the transaction (no network calls inside).
 */
export async function writeFacts(input: {
  merchantId: string;
  sourceMessageId: string;
  facts: ExtractedFact[];
}): Promise<WrittenMemory[]> {
  if (input.facts.length === 0) return [];

  const factEmbeddings = await embedMany(
    input.facts.map((fact) => fact.content),
  );

  return db.transaction(async (tx) => {
    const written: WrittenMemory[] = [];

    for (const [index, fact] of input.facts.entries()) {
      // 1. Resolve (or create) the entities the fact is about.
      const resolved: { entityId: string; role: string }[] = [];
      for (const extracted of fact.entities) {
        const normalized = normalizeName(extracted.name);
        const [existing] = await tx
          .select({ id: entities.id })
          .from(entities)
          .where(
            and(
              eq(entities.merchantId, input.merchantId),
              eq(entities.kind, extracted.kind),
              eq(entities.normalizedName, normalized),
            ),
          )
          .limit(1);

        let entityId = existing?.id;
        if (!entityId) {
          const [created] = await tx
            .insert(entities)
            .values({
              merchantId: input.merchantId,
              kind: extracted.kind,
              name: extracted.name.trim(),
              normalizedName: normalized,
            })
            .returning({ id: entities.id });
          entityId = created!.id;
        }
        resolved.push({ entityId, role: extracted.role });
      }

      // 2. Strengthen graph edges between co-mentioned entities.
      for (let a = 0; a < resolved.length; a += 1) {
        for (let b = a + 1; b < resolved.length; b += 1) {
          await tx
            .insert(entityEdges)
            .values({
              merchantId: input.merchantId,
              fromEntityId: resolved[a]!.entityId,
              toEntityId: resolved[b]!.entityId,
              relation: "mentioned_with",
            })
            .onConflictDoUpdate({
              target: [
                entityEdges.fromEntityId,
                entityEdges.toEntityId,
                entityEdges.relation,
              ],
              set: {
                weight: sql`${entityEdges.weight} + 1`,
                lastSeenAt: sql`now()`,
              },
            });
        }
      }

      // 3. Gate on confidence.
      const threshold = fact.class === "ledger" ? GATE.ledger : GATE.default;
      const passes = fact.confidence >= threshold;

      // 4. Ledger facts get a transactional row; it stays pending (no row)
      //    until the fact clears the gate or the merchant confirms.
      let ledgerEntryId: string | null = null;
      if (fact.class === "ledger" && fact.ledger && passes) {
        const counterparty = resolved.find((r) => r.role === "counterparty");
        ledgerEntryId = await createLedgerEntry(tx, {
          merchantId: input.merchantId,
          ledger: fact.ledger,
          note: fact.content,
          sourceMessageId: input.sourceMessageId,
          counterpartyEntityId: counterparty?.entityId,
        });
      }

      // 5. The memory row itself. Open-debt memories are pinned: domain-aware
      //    forgetting never touches them until the ledger entry settles.
      //    Pending money facts keep their extracted payload in structured so
      //    the confirmation flow can complete them.
      const structured =
        fact.class === "ledger" && fact.ledger && !passes
          ? { ...(fact.structured ?? {}), _ledger: fact.ledger }
          : (fact.structured ?? null);

      const [memory] = await tx
        .insert(memories)
        .values({
          merchantId: input.merchantId,
          class: fact.class,
          status: passes ? "active" : "pending",
          content: fact.content,
          structured,
          confidence: fact.confidence,
          embedding: factEmbeddings[index] ?? null,
          pinned: fact.class === "ledger" && fact.ledger?.kind === "debt",
          sourceMessageId: input.sourceMessageId,
          ledgerEntryId,
          confirmedAt: passes ? sql`now()` : null,
          confirmedVia: passes ? "auto" : null,
        })
        .returning({ id: memories.id });

      for (const { entityId, role } of resolved) {
        await tx
          .insert(memoryEntities)
          .values({ memoryId: memory!.id, entityId, role })
          .onConflictDoNothing();
      }

      written.push({
        memoryId: memory!.id,
        class: fact.class,
        status: passes ? "active" : "pending",
        content: fact.content,
        confidence: fact.confidence,
        ledgerEntryId,
      });
    }

    return written;
  });
}
