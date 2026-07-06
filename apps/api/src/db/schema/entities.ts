import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const entityKind = pgEnum("entity_kind", [
  "customer",
  "supplier",
  "product",
  "other",
]);

/**
 * Nodes of the entity graph: the people, businesses, and products the
 * merchant's memory is organized around. Every memory links to the entities
 * it is about; recall walks this graph before touching vectors.
 */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    kind: entityKind("kind").notNull(),
    name: text("name").notNull(),
    // Lowercased/trimmed form used for dedup and lookups.
    normalizedName: text("normalized_name").notNull(),
    // WhatsApp JID when the entity is a chat counterparty.
    waJid: text("wa_jid"),
    attributes: jsonb("attributes").notNull().default({}),
    embedding: vector("embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("entities_merchant_kind_name_key").on(
      table.merchantId,
      table.kind,
      table.normalizedName,
    ),
    index("entities_merchant_idx").on(table.merchantId),
  ],
);

/**
 * Edges of the entity graph, accumulated from extracted facts
 * (e.g. customer —buys→ product, supplier —supplies→ product).
 */
export const entityEdges = pgTable(
  "entity_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    // Strengthens with repeated observations; recall uses it for ranking.
    weight: real("weight").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("entity_edges_from_to_relation_key").on(
      table.fromEntityId,
      table.toEntityId,
      table.relation,
    ),
    index("entity_edges_merchant_idx").on(table.merchantId),
  ],
);
