/**
 * The Kata benchmark: exact-recall scoring of four systems over the same
 * synthetic merchant history, at the same token budget.
 *
 *   kata          — full pipeline: extraction → gate → ledger → hybrid recall
 *   naive-rag     — embed raw messages, similarity top-k within budget
 *   recent-window — newest raw messages within budget
 *   full-history  — every raw message, no budget (cost ceiling reference)
 *
 * Ground truth is generated, not inferred; scoring is deterministic regex
 * matching. Run: bun run bench
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  entities,
  entityEdges,
  ledgerEntries,
  memories,
  memoryEntities,
  merchants,
  messages as messagesTable,
  recallTraces,
} from "@/db/schema";
import { ingestMessage } from "@/ingest/ingest";
import { confirmMemory } from "@/memory/confirm";
import { recall } from "@/memory/recall";
import { fullHistory, makeNaiveRag, recentWindow } from "./baselines";
import { generateDataset, type BenchMessage } from "./dataset";
import { scoreAnswer, type QuestionScore } from "./score";

const BUDGET = 800;
const MERCHANT_NAME = "Benchmark Merchant";
const CONCURRENCY = 5;

async function resetBenchMerchant(): Promise<string> {
  const [existing] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.name, MERCHANT_NAME))
    .limit(1);

  if (existing) {
    // Ordered deletes: ledger rows restrict entity deletion.
    await db.delete(recallTraces).where(eq(recallTraces.merchantId, existing.id));
    await db.delete(memories).where(eq(memories.merchantId, existing.id));
    await db.delete(ledgerEntries).where(eq(ledgerEntries.merchantId, existing.id));
    await db.delete(entityEdges).where(eq(entityEdges.merchantId, existing.id));
    await db.delete(entities).where(eq(entities.merchantId, existing.id));
    await db.delete(messagesTable).where(eq(messagesTable.merchantId, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(merchants)
    .values({ name: MERCHANT_NAME })
    .returning({ id: merchants.id });
  return created!.id;
}

/**
 * Ingest with per-customer ordering (a payment must follow its debt) and
 * cross-customer parallelism. Entity-creation races retry once.
 */
async function ingestAll(
  merchantId: string,
  messages: BenchMessage[],
): Promise<void> {
  const lanes = new Map<string, BenchMessage[]>();
  for (const message of messages) {
    const lane = lanes.get(message.customerKey) ?? [];
    lane.push(message);
    lanes.set(message.customerKey, lane);
  }

  let done = 0;
  const total = messages.length;
  const queue = [...lanes.values()];

  async function worker(): Promise<void> {
    for (;;) {
      const lane = queue.shift();
      if (!lane) return;
      for (const message of lane) {
        try {
          await ingestMessage({
            merchantId,
            channel: "simulator",
            chatJid: `bench:${message.customerKey}`,
            senderJid: `bench:${message.customerKey}`,
            body: message.body,
            sentAt: message.sentAt,
          });
        } catch {
          await ingestMessage({
            merchantId,
            channel: "simulator",
            chatJid: `bench:${message.customerKey}`,
            senderJid: `bench:${message.customerKey}`,
            body: message.body,
            sentAt: message.sentAt,
          });
        }
        done += 1;
        if (done % 20 === 0) console.log(`  ingested ${done}/${total}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );
}

/**
 * The merchant side of the confidence gate: everything the extractor held
 * as pending gets confirmed as-extracted (no oracle corrections), in source
 * message order so settlements net out the way the merchant would see them.
 */
async function confirmAllPending(merchantId: string): Promise<number> {
  const pending = await db
    .select({ id: memories.id })
    .from(memories)
    .innerJoin(messagesTable, eq(memories.sourceMessageId, messagesTable.id))
    .where(
      and(eq(memories.merchantId, merchantId), eq(memories.status, "pending")),
    )
    .orderBy(asc(messagesTable.sentAt));

  for (const memory of pending) {
    await confirmMemory({ merchantId, memoryId: memory.id });
  }
  return pending.length;
}

type SystemResult = {
  scores: QuestionScore[];
  contextTokens: number[];
  answers: Record<string, string>;
};

function summarize(result: SystemResult) {
  const recallAvg =
    result.scores.reduce((sum, s) => sum + s.recall, 0) / result.scores.length;
  const phantoms = result.scores.reduce((sum, s) => sum + s.phantoms.length, 0);
  const avgTokens = Math.round(
    result.contextTokens.reduce((a, b) => a + b, 0) /
      result.contextTokens.length,
  );
  return { recall: recallAvg, phantoms, avgContextTokens: avgTokens };
}

async function main() {
  const skipIngest = process.argv.includes("--skip-ingest");
  const dataset = generateDataset();
  console.log(
    `dataset: ${dataset.summary.messages} messages, ${dataset.summary.customers} customers, ` +
      `${dataset.summary.openDebtors.length} open debtors, ${dataset.summary.settled.length} settled, ` +
      `${dataset.questions.length} questions`,
  );

  let merchantId: string;
  if (skipIngest) {
    const [existing] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.name, MERCHANT_NAME))
      .limit(1);
    if (!existing) throw new Error("--skip-ingest: no benchmark merchant yet");
    merchantId = existing.id;
    console.log("reusing existing ingested state (--skip-ingest)");
  } else {
    console.log("resetting benchmark merchant…");
    merchantId = await resetBenchMerchant();

    console.log("ingesting through the Kata pipeline…");
    const startIngest = Date.now();
    await ingestAll(merchantId, dataset.messages);
    console.log(
      `ingest done in ${Math.round((Date.now() - startIngest) / 1000)}s`,
    );

    const confirmed = await confirmAllPending(merchantId);
    console.log(`confirmed ${confirmed} pending facts (merchant queue pass)`);
  }

  const naiveRag = makeNaiveRag(dataset.messages);
  const systems: Record<string, SystemResult> = {};
  for (const name of ["kata", "naive-rag", "recent-window", "full-history"]) {
    systems[name] = { scores: [], contextTokens: [], answers: {} };
  }

  for (const question of dataset.questions) {
    console.log(`\nQ [${question.id}] ${question.question}`);

    const kataResult = await recall({
      merchantId,
      question: question.question,
      tokenBudget: BUDGET,
    });
    const rag = await naiveRag(question.question, BUDGET);
    const recent = await recentWindow(question.question, dataset.messages, BUDGET);
    const full = await fullHistory(question.question, dataset.messages);

    const runs: [string, string, number][] = [
      ["kata", kataResult.answer, kataResult.pack.usedTokens],
      ["naive-rag", rag.answer, rag.contextTokens],
      ["recent-window", recent.answer, recent.contextTokens],
      ["full-history", full.answer, full.contextTokens],
    ];

    for (const [name, answer, tokens] of runs) {
      const score = scoreAnswer(question, answer);
      systems[name]!.scores.push(score);
      systems[name]!.contextTokens.push(tokens);
      systems[name]!.answers[question.id] = answer;
      console.log(
        `  ${name.padEnd(14)} recall ${(score.recall * 100).toFixed(0).padStart(3)}%` +
          ` phantoms ${score.phantoms.length} ctx ${tokens}t`,
      );
    }
  }

  console.log("\n══ RESULTS ══");
  const table = Object.entries(systems).map(([name, result]) => ({
    system: name,
    ...summarize(result),
  }));
  console.table(table);

  const output = {
    ranAt: new Date().toISOString(),
    budgetTokens: BUDGET,
    dataset: dataset.summary,
    results: Object.fromEntries(
      Object.entries(systems).map(([name, result]) => [
        name,
        { ...summarize(result), perQuestion: result.scores, answers: result.answers },
      ]),
    ),
  };
  await Bun.write(
    new URL("../../benchmark-results.json", import.meta.url),
    JSON.stringify(output, null, 2),
  );
  console.log("written: apps/api/benchmark-results.json");
  process.exit(0);
}

main().catch((error) => {
  console.error("benchmark failed:", error);
  process.exit(1);
});
