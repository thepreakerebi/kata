import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

/**
 * One row per recall: what was asked, what the classifier decided, which
 * candidates each retrieval path produced, and what the packer kept within
 * the token budget — the dashboard's visible trace and the benchmark's
 * raw material.
 */
export const recallTraces = pgTable(
  "recall_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    // Classifier output: "ledger" | "entity" | "episodic" | "general" | …
    queryKind: text("query_kind").notNull(),
    // Retrieved candidates with per-path scores (graph walk, vector search).
    candidates: jsonb("candidates").notNull(),
    // What survived the token budget, with the packer's reasons.
    packed: jsonb("packed").notNull(),
    tokenBudget: integer("token_budget").notNull(),
    packedTokens: integer("packed_tokens").notNull(),
    answer: text("answer"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recall_traces_merchant_created_idx").on(
      table.merchantId,
      table.createdAt,
    ),
  ],
);
