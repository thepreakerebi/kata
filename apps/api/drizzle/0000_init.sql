CREATE TYPE "public"."entity_kind" AS ENUM('customer', 'supplier', 'product', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'simulator');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('debt', 'payment', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('open', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."memory_class" AS ENUM('episodic', 'semantic', 'procedural', 'ledger');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('pending', 'active', 'superseded', 'archived');--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"wa_jid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_wa_jid_unique" UNIQUE("wa_jid")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"wa_jid" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"wa_message_id" text,
	"chat_jid" text NOT NULL,
	"sender_jid" text NOT NULL,
	"body" text,
	"media_s3_key" text,
	"media_type" text,
	"sent_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"counterparty_entity_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"status" "ledger_status" DEFAULT 'open' NOT NULL,
	"due_date" date,
	"note" text,
	"source_message_id" uuid,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"class" "memory_class" NOT NULL,
	"status" "memory_status" DEFAULT 'pending' NOT NULL,
	"content" text NOT NULL,
	"structured" jsonb,
	"confidence" real NOT NULL,
	"embedding" vector(1024),
	"salience" real DEFAULT 1 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"source_message_id" uuid NOT NULL,
	"superseded_by_id" uuid,
	"ledger_entry_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_via" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entities" (
	"memory_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "memory_entities_memory_id_entity_id_role_pk" PRIMARY KEY("memory_id","entity_id","role")
);
--> statement-breakpoint
CREATE TABLE "recall_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"query" text NOT NULL,
	"query_kind" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"packed" jsonb NOT NULL,
	"token_budget" integer NOT NULL,
	"packed_tokens" integer NOT NULL,
	"answer" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_counterparty_entity_id_entities_id_fk" FOREIGN KEY ("counterparty_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_superseded_by_id_memories_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_traces" ADD CONSTRAINT "recall_traces_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_merchant_kind_name_key" ON "entities" USING btree ("merchant_id","kind","normalized_name");--> statement-breakpoint
CREATE INDEX "entities_merchant_idx" ON "entities" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_edges_from_to_relation_key" ON "entity_edges" USING btree ("from_entity_id","to_entity_id","relation");--> statement-breakpoint
CREATE INDEX "entity_edges_merchant_idx" ON "entity_edges" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "messages_merchant_chat_sent_idx" ON "messages" USING btree ("merchant_id","chat_jid","sent_at");--> statement-breakpoint
CREATE INDEX "ledger_merchant_status_idx" ON "ledger_entries" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "ledger_counterparty_status_idx" ON "ledger_entries" USING btree ("counterparty_entity_id","status");--> statement-breakpoint
CREATE INDEX "memories_merchant_class_status_idx" ON "memories" USING btree ("merchant_id","class","status");--> statement-breakpoint
CREATE INDEX "memories_merchant_status_idx" ON "memories" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "memory_entities_entity_idx" ON "memory_entities" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "recall_traces_merchant_created_idx" ON "recall_traces" USING btree ("merchant_id","created_at");