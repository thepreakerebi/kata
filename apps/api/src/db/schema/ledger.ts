import {
  char,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "./entities";
import { merchants } from "./merchants";
import { messages } from "./messages";

export const ledgerKind = pgEnum("ledger_kind", ["debt", "payment", "credit"]);

export const ledgerStatus = pgEnum("ledger_status", [
  "open",
  "settled",
  "cancelled",
]);

/**
 * The ledger memory class gets its own transactional table: money facts are
 * the memories where being wrong is worse than forgetting. The invariant
 * "open debts never decay" is enforced here — decay logic never touches rows
 * with status = 'open'.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    counterpartyEntityId: uuid("counterparty_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    kind: ledgerKind("kind").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    status: ledgerStatus("status").notNull().default("open"),
    dueDate: date("due_date"),
    note: text("note"),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_merchant_status_idx").on(table.merchantId, table.status),
    index("ledger_counterparty_status_idx").on(
      table.counterpartyEntityId,
      table.status,
    ),
  ],
);
