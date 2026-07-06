import { z } from "zod";
import { completeJson, embed, embedMany } from "@/llm/client";
import type { BenchMessage } from "./dataset";

const answerSchema = z.object({
  answer: z
    .string()
    .min(1)
    .transform((value) => value.slice(0, 4000)),
});

const BASELINE_SYSTEM = `You answer a merchant's question using ONLY the chat messages provided. The messages are the merchant's business records (orders, credit, payments). Rules:
- Never invent names, amounts, or dates that are not in the messages.
- Money answers state amounts with currency.
- Account for payments: if someone paid part or all of what they owed, reflect it.
- If the messages do not contain the answer, say so plainly.
- Reply in one short paragraph, conversational, no markdown.`;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function renderContext(messages: BenchMessage[]): string {
  return messages
    .map((m) => `[${m.sentAt.toISOString().slice(0, 10)}] ${m.body}`)
    .join("\n");
}

async function answerFrom(
  question: string,
  messages: BenchMessage[],
): Promise<{ answer: string; contextTokens: number }> {
  const context = renderContext(messages);
  const result = await completeJson({
    system: BASELINE_SYSTEM,
    user: `Question: ${question}\n\nChat messages:\n${context || "(none)"}\n\nReturn JSON {"answer": "..."}.`,
    schema: answerSchema,
  });
  return { answer: result.answer, contextTokens: estimateTokens(context) };
}

/** Baseline A: the full raw history, no budget — the "paste everything" ceiling. */
export async function fullHistory(question: string, messages: BenchMessage[]) {
  return answerFrom(question, messages);
}

/** Baseline B: most recent messages that fit the token budget. */
export async function recentWindow(
  question: string,
  messages: BenchMessage[],
  budget: number,
) {
  const picked: BenchMessage[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    const tokens = estimateTokens(`[0000-00-00] ${message.body}`);
    if (used + tokens > budget) break;
    used += tokens;
    picked.unshift(message);
  }
  return answerFrom(question, picked);
}

/**
 * Baseline C: naive RAG — embed raw messages, retrieve by cosine similarity
 * until the budget is full. No extraction, no ledger, no settlement.
 */
export function makeNaiveRag(messages: BenchMessage[]) {
  let vectorsPromise: Promise<number[][]> | null = null;

  return async function naiveRag(question: string, budget: number) {
    vectorsPromise ??= embedMany(messages.map((m) => m.body));
    const vectors = await vectorsPromise;
    const queryVector = await embed(question);

    const scored = messages
      .map((message, index) => {
        const vector = vectors[index]!;
        let dot = 0;
        for (let i = 0; i < vector.length; i += 1) {
          dot += vector[i]! * queryVector[i]!;
        }
        return { message, similarity: dot };
      })
      .sort((a, b) => b.similarity - a.similarity);

    const picked: BenchMessage[] = [];
    let used = 0;
    for (const { message } of scored) {
      const tokens = estimateTokens(`[0000-00-00] ${message.body}`);
      if (used + tokens > budget) break;
      used += tokens;
      picked.push(message);
    }
    picked.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    return answerFrom(question, picked);
  };
}
