/**
 * Idempotent post-push setup. drizzle-kit cannot emit CockroachDB's
 * `CREATE VECTOR INDEX` DDL, so the distributed vector indexes live here and
 * this script runs after every `db:push` (locally and in deploy).
 *
 * Run: bun run db:setup
 */
import postgres from "postgres";

const databaseUrl = Bun.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });

const vectorIndexes = [
  {
    name: "memories_embedding_vec_idx",
    ddl: `CREATE VECTOR INDEX IF NOT EXISTS memories_embedding_vec_idx ON memories (embedding)`,
  },
  {
    name: "entities_embedding_vec_idx",
    ddl: `CREATE VECTOR INDEX IF NOT EXISTS entities_embedding_vec_idx ON entities (embedding)`,
  },
] as const;

for (const { name, ddl } of vectorIndexes) {
  await sql.unsafe(ddl);
  console.log(`vector index ready: ${name}`);
}

await sql.end();
console.log("db setup complete");
