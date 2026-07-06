import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db/client";
import { entities, ledgerEntries, memories } from "@/db/schema";
import { getOrCreateDemoMerchant } from "@/ingest/ingest";

/** Read endpoints backing the dashboard's memory brain and ledger views. */
export const memoryRoutes = new Hono()
  .get("/", async (c) => {
    const merchantId = await getOrCreateDemoMerchant();
    const rows = await db
      .select({
        id: memories.id,
        class: memories.class,
        status: memories.status,
        content: memories.content,
        confidence: memories.confidence,
        salience: memories.salience,
        pinned: memories.pinned,
        confirmedVia: memories.confirmedVia,
        lastAccessedAt: memories.lastAccessedAt,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(eq(memories.merchantId, merchantId))
      .orderBy(desc(memories.createdAt))
      .limit(200);

    const [counts] = await db
      .select({
        active: sql<number>`count(*) FILTER (WHERE ${memories.status} = 'active')`,
        pending: sql<number>`count(*) FILTER (WHERE ${memories.status} = 'pending')`,
        archived: sql<number>`count(*) FILTER (WHERE ${memories.status} = 'archived')`,
      })
      .from(memories)
      .where(eq(memories.merchantId, merchantId));

    return c.json({ memories: rows, counts });
  })
  .get("/ledger", async (c) => {
    const merchantId = await getOrCreateDemoMerchant();
    const open = await db
      .select({
        id: ledgerEntries.id,
        counterparty: entities.name,
        kind: ledgerEntries.kind,
        amount: ledgerEntries.amount,
        currency: ledgerEntries.currency,
        dueDate: ledgerEntries.dueDate,
        note: ledgerEntries.note,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .innerJoin(entities, eq(ledgerEntries.counterpartyEntityId, entities.id))
      .where(
        and(
          eq(ledgerEntries.merchantId, merchantId),
          eq(ledgerEntries.status, "open"),
        ),
      )
      .orderBy(ledgerEntries.dueDate);
    return c.json({ open });
  });
