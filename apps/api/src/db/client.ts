import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  max: 10,
  connect_timeout: 15,
});

export const db = drizzle(client, { schema });

export type Db = typeof db;

const RETRYABLE_CODES = new Set([
  "40001", // serialization failure — CockroachDB's documented retry contract
  "23505", // unique violation from a concurrent insert; retry re-reads the row
]);

/**
 * Run a transactional operation with CockroachDB retry semantics:
 * serialization conflicts and insert races roll back cleanly, so the whole
 * operation re-runs with exponential backoff and jitter.
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code =
        (error as { code?: string }).code ??
        ((error as { cause?: { code?: string } }).cause?.code ?? "");
      if (!RETRYABLE_CODES.has(code) || attempt >= maxAttempts) throw error;
      const backoff = 50 * 2 ** (attempt - 1) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
