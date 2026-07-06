import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memories, recallTraces } from "@/db/schema";
import { answerFromMemory } from "./answer";
import { classifyQuery } from "./classify";
import { pack, type PackResult } from "./pack";
import { retrieve } from "./retrieve";

export type RecallResult = {
  traceId: string;
  answer: string;
  kind: string;
  pack: PackResult;
  candidateCount: number;
  latencyMs: number;
};

/**
 * Full recall: classify → hybrid retrieval → token-budgeted packing →
 * grounded answer. Every step lands in recall_traces (the dashboard's
 * visible trace and the benchmark's raw material), and packed memories get
 * their last_accessed_at touched — recall is what keeps a memory alive.
 */
export async function recall(input: {
  merchantId: string;
  question: string;
  tokenBudget?: number;
}): Promise<RecallResult> {
  const startedAt = Date.now();

  const classification = await classifyQuery(input.question);
  const { candidates, ledgerLines } = await retrieve({
    merchantId: input.merchantId,
    question: input.question,
    classification,
  });
  const packResult = pack({
    candidates,
    ledgerLines,
    kind: classification.kind,
    budget: input.tokenBudget,
  });
  const answer = await answerFromMemory({
    question: input.question,
    pack: packResult,
  });

  const latencyMs = Date.now() - startedAt;

  const packedIds = packResult.packed.map((item) => item.memoryId);
  if (packedIds.length > 0) {
    await db
      .update(memories)
      .set({ lastAccessedAt: sql`now()` })
      .where(inArray(memories.id, packedIds));
  }

  const [trace] = await db
    .insert(recallTraces)
    .values({
      merchantId: input.merchantId,
      query: input.question,
      queryKind: classification.kind,
      candidates: candidates.map((candidate) => ({
        memoryId: candidate.memoryId,
        class: candidate.class,
        status: candidate.status,
        content: candidate.content,
        paths: candidate.paths,
      })),
      packed: {
        items: packResult.packed,
        excluded: packResult.excluded,
        ledgerLines: packResult.ledgerLines,
      },
      tokenBudget: packResult.budget,
      packedTokens: packResult.usedTokens,
      answer,
      latencyMs,
    })
    .returning({ id: recallTraces.id });

  return {
    traceId: trace!.id,
    answer,
    kind: classification.kind,
    pack: packResult,
    candidateCount: candidates.length,
    latencyMs,
  };
}
