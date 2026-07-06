import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memories } from "@/db/schema";

/**
 * Domain-aware forgetting. Forgetting is demotion, never deletion:
 * salience decays per class half-life measured from the last time a memory
 * was recalled (or created), and memories that fall below the archive
 * threshold demote to "archived" — out of recall, never out of the record.
 *
 * The domain rules:
 * - episodic events fade fastest; semantic facts and preferences linger;
 *   procedural instructions (merchant corrections) barely fade at all.
 * - pinned memories NEVER decay — open debts stay at full salience until
 *   the ledger entry settles, no matter how old they get.
 * - recall refreshes last_accessed_at, so what the merchant uses stays alive.
 */
const HALF_LIFE_DAYS = {
  episodic: 14,
  semantic: 60,
  procedural: 120,
  ledger: 30, // settled/non-pinned money memories only; open debts are pinned
} as const;

const ARCHIVE_BELOW = 0.15;

export type DecayReport = {
  class: keyof typeof HALF_LIFE_DAYS;
  decayed: number;
  archived: number;
}[];

/** Recompute salience and demote faded memories. Idempotent per run. */
export async function runDecay(): Promise<DecayReport> {
  const report: DecayReport = [];

  for (const [memoryClass, halfLife] of Object.entries(HALF_LIFE_DAYS) as [
    keyof typeof HALF_LIFE_DAYS,
    number,
  ][]) {
    const ageDays = sql`extract(epoch FROM (now() - coalesce(${memories.lastAccessedAt}, ${memories.createdAt}))) / 86400.0`;

    const decayed = await db
      .update(memories)
      .set({
        salience: sql`greatest(0.0, exp(-0.6931 * (${ageDays}) / ${halfLife}))`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(memories.class, memoryClass),
          eq(memories.status, "active"),
          eq(memories.pinned, false),
        ),
      )
      .returning({ id: memories.id });

    const archived = await db
      .update(memories)
      .set({ status: "archived", updatedAt: sql`now()` })
      .where(
        and(
          eq(memories.class, memoryClass),
          eq(memories.status, "active"),
          eq(memories.pinned, false),
          lt(memories.salience, ARCHIVE_BELOW),
        ),
      )
      .returning({ id: memories.id });

    report.push({
      class: memoryClass,
      decayed: decayed.length,
      archived: archived.length,
    });
  }

  return report;
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** Background decay loop for the long-lived process. */
export function startDecayLoop(): void {
  setInterval(() => {
    runDecay().catch((error) => {
      console.error("decay run failed:", (error as Error).message);
    });
  }, TWELVE_HOURS_MS);
}
