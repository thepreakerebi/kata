import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { ledgerEntries } from "./ledger";
import { merchants } from "./merchants";
import { messages } from "./messages";

export const memoryClass = pgEnum("memory_class", [
  "episodic",
  "semantic",
  "procedural",
  "ledger",
]);

export const memoryStatus = pgEnum("memory_status", [
  // Below the confidence gate — waiting in the merchant confirmation queue.
  "pending",
  "active",
  // Contradicted by a newer fact; history is retained, never deleted.
  "superseded",
  // Demoted by domain-aware forgetting (resolved transactions, faded prefs).
  "archived",
]);

/**
 * The memory store. One row = one distilled fact with provenance, confidence,
 * and an embedding. Forgetting is demotion (status/salience), never deletion.
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    class: memoryClass("class").notNull(),
    status: memoryStatus("status").notNull().default("pending"),
    // Canonical natural-language statement of the fact.
    content: text("content").notNull(),
    // Typed payload (e.g. { item, quantity, price } for an order fact).
    structured: jsonb("structured"),
    // Extraction confidence in [0,1]; the write gate thresholds on this.
    confidence: real("confidence").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    // Decay inputs: salience decays per class policy; pinned never decays
    // (open-debt memories are pinned until the ledger entry settles).
    salience: real("salience").notNull().default(1),
    pinned: boolean("pinned").notNull().default(false),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    // Provenance: the message this fact was extracted from.
    sourceMessageId: uuid("source_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "restrict" }),
    supersededById: uuid("superseded_by_id").references(
      (): AnyPgColumn => memories.id,
      { onDelete: "set null" },
    ),
    // Set when class = 'ledger'; the transactional row backing this memory.
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id, {
      onDelete: "set null",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // How the fact cleared the gate: "auto" | "merchant" | "corrected".
    confirmedVia: text("confirmed_via"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("memories_merchant_class_status_idx").on(
      table.merchantId,
      table.class,
      table.status,
    ),
    index("memories_merchant_status_idx").on(table.merchantId, table.status),
  ],
);

/**
 * Which entities a memory is about — the join that lets recall walk from an
 * entity to everything remembered about it.
 */
export const memoryEntities = pgTable(
  "memory_entities",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    // Role of the entity in the fact: "subject" | "object" | "counterparty".
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.memoryId, table.entityId, table.role] }),
    index("memory_entities_entity_idx").on(table.entityId),
  ],
);
