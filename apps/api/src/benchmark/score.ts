import type { BenchQuestion } from "./dataset";

export type QuestionScore = {
  questionId: string;
  recall: number;
  hits: string[];
  misses: string[];
  phantoms: string[];
};

/**
 * Deterministic scoring: required patterns must appear in the answer,
 * forbidden patterns must not. Amounts are matched after stripping the
 * separators models like to add. No LLM grades an LLM.
 */
export function scoreAnswer(
  question: BenchQuestion,
  answer: string,
): QuestionScore {
  const normalized = answer
    .toLowerCase()
    .replace(/(\d)[,\s](?=\d{3}\b)/g, "$1");

  const hits: string[] = [];
  const misses: string[] = [];
  for (const expectation of question.expect) {
    if (new RegExp(expectation.pattern, "i").test(normalized)) {
      hits.push(expectation.label);
    } else {
      misses.push(expectation.label);
    }
  }

  const phantoms: string[] = [];
  for (const forbidden of question.forbid) {
    if (new RegExp(forbidden.pattern, "i").test(normalized)) {
      phantoms.push(forbidden.label);
    }
  }

  return {
    questionId: question.id,
    recall: question.expect.length === 0 ? 1 : hits.length / question.expect.length,
    hits,
    misses,
    phantoms,
  };
}
