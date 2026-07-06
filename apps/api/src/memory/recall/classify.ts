import { z } from "zod";
import { completeJson } from "@/llm/client";

const classificationSchema = z.object({
  kind: z
    .enum(["ledger", "entity", "episodic", "general"])
    .catch("general"),
  // Entity names mentioned in the query, used to seed the graph walk.
  entities: z.array(z.string().min(1).max(200)).max(5).default([]),
});

export type QueryClassification = z.infer<typeof classificationSchema>;

const SYSTEM_PROMPT = `You classify a merchant's question about their business memory.

Return JSON {"kind": ..., "entities": [...]}.
- "kind": exactly one of
  - "ledger" — about money: who owes, balances, payments, debts due
  - "entity" — about a specific person/supplier/product ("what does Mama C usually buy?")
  - "episodic" — about events in time ("what happened yesterday?", "what did I sell last week?")
  - "general" — anything else
- "entities": names of people, businesses, or products mentioned in the question, exactly as written. Empty array if none.`;

/** Classify one recall query. Cheap call — minimal reasoning, tiny output. */
export async function classifyQuery(
  question: string,
): Promise<QueryClassification> {
  return completeJson({
    system: SYSTEM_PROMPT,
    user: question,
    schema: classificationSchema,
  });
}
