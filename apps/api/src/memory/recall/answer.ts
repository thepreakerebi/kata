import { z } from "zod";
import { completeJson } from "@/llm/client";
import type { PackResult } from "./pack";

const answerSchema = z.object({
  answer: z.string().min(1).max(2000),
});

const SYSTEM_PROMPT = `You answer a merchant's question using ONLY the memory context provided. Rules:
- Never invent names, amounts, or dates that are not in the context.
- Facts marked [unconfirmed] are awaiting the merchant's confirmation — if you use one, say it is unconfirmed.
- Money answers state amounts with currency and due dates when known.
- If the context does not contain the answer, say so plainly and suggest what the merchant could ask instead.
- Reply in one short paragraph, conversational, no markdown.`;

/** Answer strictly from the packed context; the packer decided what it sees. */
export async function answerFromMemory(input: {
  question: string;
  pack: PackResult;
}): Promise<string> {
  const ledgerBlock =
    input.pack.ledgerLines.length > 0
      ? `Open ledger positions:\n${input.pack.ledgerLines
          .map(
            (line) =>
              `- ${line.counterparty}: ${line.kind} ${line.amount} ${line.currency}${line.dueDate ? `, due ${line.dueDate}` : ""}${line.note ? ` (${line.note})` : ""}`,
          )
          .join("\n")}`
      : "";

  const memoryBlock =
    input.pack.packed.length > 0
      ? `Memories:\n${input.pack.packed
          .map(
            (item) =>
              `- ${item.status === "pending" ? "[unconfirmed] " : ""}${item.content}`,
          )
          .join("\n")}`
      : "";

  const context = [ledgerBlock, memoryBlock].filter(Boolean).join("\n\n");

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Question: ${input.question}\n\n${context || "The memory context is empty."}\n\nReturn JSON {"answer": "..."}.`,
    schema: answerSchema,
  });
  return result.answer;
}
