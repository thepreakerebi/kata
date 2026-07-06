import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // WhatsApp JID of the merchant's own account (the Baileys session owner).
  waJid: text("wa_jid").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
