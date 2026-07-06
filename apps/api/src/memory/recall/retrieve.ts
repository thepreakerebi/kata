import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  entities,
  entityEdges,
  ledgerEntries,
  memories,
  memoryEntities,
} from "@/db/schema";
import { embed } from "@/llm/client";
import type { QueryClassification } from "./classify";

/** One retrieval candidate with per-path provenance for the trace. */
export type Candidate = {
  memoryId: string;
  class: string;
  status: string;
  content: string;
  confidence: number;
  salience: number;
  pinned: boolean;
  createdAt: Date;
  paths: {
    vector?: { distance: number };
    entity?: { name: string };
    graph?: { via: string; weight: number };
  };
};

/** Open money positions, fetched deterministically for ledger questions. */
export type LedgerLine = {
  counterparty: string;
  kind: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  note: string | null;
};

const VECTOR_K = 12;
const RECALLABLE = ["active", "pending"] as const;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Hybrid retrieval: vector search over the CockroachDB vector index, an
 * entity-graph walk seeded by names in the query (1 hop via edges), and a
 * deterministic sweep of open ledger entries for money questions. Each path
 * annotates candidates so the packer can show why something surfaced.
 */
export async function retrieve(input: {
  merchantId: string;
  question: string;
  classification: QueryClassification;
}): Promise<{ candidates: Candidate[]; ledgerLines: LedgerLine[] }> {
  const byId = new Map<string, Candidate>();

  const upsert = (
    row: {
      id: string;
      class: string;
      status: string;
      content: string;
      confidence: number;
      salience: number;
      pinned: boolean;
      createdAt: Date;
    },
    path: Partial<Candidate["paths"]>,
  ) => {
    const existing = byId.get(row.id);
    if (existing) {
      Object.assign(existing.paths, path);
      return;
    }
    byId.set(row.id, {
      memoryId: row.id,
      class: row.class,
      status: row.status,
      content: row.content,
      confidence: row.confidence,
      salience: row.salience,
      pinned: row.pinned,
      createdAt: row.createdAt,
      paths: { ...path },
    });
  };

  // ── Path 1: vector search (uses the distributed vector index) ────────────
  const queryVector = await embed(input.question);
  const vectorLiteral = `[${queryVector.join(",")}]`;
  const distance = sql<number>`${memories.embedding} <-> ${vectorLiteral}`;
  const vectorRows = await db
    .select({
      id: memories.id,
      class: memories.class,
      status: memories.status,
      content: memories.content,
      confidence: memories.confidence,
      salience: memories.salience,
      pinned: memories.pinned,
      createdAt: memories.createdAt,
      distance,
    })
    .from(memories)
    .where(
      and(
        eq(memories.merchantId, input.merchantId),
        inArray(memories.status, [...RECALLABLE]),
        sql`${memories.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(distance)
    .limit(VECTOR_K);
  for (const row of vectorRows) {
    upsert(row, { vector: { distance: row.distance } });
  }

  // ── Path 2: entity match + 1-hop graph walk ───────────────────────────────
  const mentioned = input.classification.entities.map(normalizeName);
  if (mentioned.length > 0) {
    const nameFilters = mentioned.map((name) =>
      or(
        eq(entities.normalizedName, name),
        sql`${entities.normalizedName} LIKE ${`%${name}%`}`,
      ),
    );
    const seeds = await db
      .select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(
        and(eq(entities.merchantId, input.merchantId), or(...nameFilters)),
      )
      .limit(10);

    if (seeds.length > 0) {
      const seedIds = seeds.map((seed) => seed.id);
      const seedName = new Map(seeds.map((seed) => [seed.id, seed.name]));

      const direct = await db
        .select({
          entityId: memoryEntities.entityId,
          id: memories.id,
          class: memories.class,
          status: memories.status,
          content: memories.content,
          confidence: memories.confidence,
          salience: memories.salience,
          pinned: memories.pinned,
          createdAt: memories.createdAt,
        })
        .from(memoryEntities)
        .innerJoin(memories, eq(memoryEntities.memoryId, memories.id))
        .where(
          and(
            inArray(memoryEntities.entityId, seedIds),
            inArray(memories.status, [...RECALLABLE]),
          ),
        )
        .orderBy(desc(memories.createdAt))
        .limit(20);
      for (const row of direct) {
        upsert(row, {
          entity: { name: seedName.get(row.entityId) ?? "matched entity" },
        });
      }

      const neighbors = await db
        .select({
          neighborId: entityEdges.toEntityId,
          via: entityEdges.relation,
          weight: entityEdges.weight,
        })
        .from(entityEdges)
        .where(inArray(entityEdges.fromEntityId, seedIds))
        .orderBy(desc(entityEdges.weight))
        .limit(10);

      if (neighbors.length > 0) {
        const neighborIds = neighbors.map((n) => n.neighborId);
        const edgeByEntity = new Map(
          neighbors.map((n) => [n.neighborId, n]),
        );
        const hop = await db
          .select({
            entityId: memoryEntities.entityId,
            id: memories.id,
            class: memories.class,
            status: memories.status,
            content: memories.content,
            confidence: memories.confidence,
            salience: memories.salience,
            pinned: memories.pinned,
            createdAt: memories.createdAt,
          })
          .from(memoryEntities)
          .innerJoin(memories, eq(memoryEntities.memoryId, memories.id))
          .where(
            and(
              inArray(memoryEntities.entityId, neighborIds),
              inArray(memories.status, [...RECALLABLE]),
            ),
          )
          .orderBy(desc(memories.createdAt))
          .limit(10);
        for (const row of hop) {
          const edge = edgeByEntity.get(row.entityId);
          upsert(row, {
            graph: { via: edge?.via ?? "related", weight: edge?.weight ?? 1 },
          });
        }
      }
    }
  }

  // ── Path 3: open ledger sweep for money questions ─────────────────────────
  let ledgerLines: LedgerLine[] = [];
  if (input.classification.kind === "ledger") {
    const rows = await db
      .select({
        counterparty: entities.name,
        kind: ledgerEntries.kind,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        dueDate: ledgerEntries.dueDate,
        note: ledgerEntries.note,
      })
      .from(ledgerEntries)
      .innerJoin(entities, eq(ledgerEntries.counterpartyEntityId, entities.id))
      .where(
        and(
          eq(ledgerEntries.merchantId, input.merchantId),
          eq(ledgerEntries.status, "open"),
        ),
      )
      .orderBy(ledgerEntries.dueDate)
      .limit(50);
    ledgerLines = rows;
  }

  return { candidates: [...byId.values()], ledgerLines };
}
