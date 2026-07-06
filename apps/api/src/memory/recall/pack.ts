import type { QueryClassification } from "./classify";
import type { Candidate, LedgerLine } from "./retrieve";

export type PackedItem = {
  memoryId: string;
  class: string;
  status: string;
  content: string;
  createdAt: string;
  score: number;
  tokens: number;
  reasons: string[];
};

export type PackResult = {
  packed: PackedItem[];
  excluded: { memoryId: string; score: number; reason: string }[];
  ledgerLines: LedgerLine[];
  budget: number;
  usedTokens: number;
};

const DEFAULT_BUDGET = 800;

/** Rough token estimate; good enough for budgeting. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score a candidate for this query. Every component is visible in the trace:
 * vector similarity, entity/graph provenance, class affinity with the query
 * kind, salience (decay input), and pinned status (open debts float).
 */
function score(
  candidate: Candidate,
  kind: QueryClassification["kind"],
): { value: number; reasons: string[] } {
  const reasons: string[] = [];
  let value = 0;

  if (candidate.paths.vector) {
    const similarity = Math.max(0, 1 - candidate.paths.vector.distance / 2);
    value += similarity;
    reasons.push(`vector similarity ${similarity.toFixed(2)}`);
  }
  if (candidate.paths.entity) {
    value += 0.6;
    reasons.push(`mentions ${candidate.paths.entity.name}`);
  }
  if (candidate.paths.graph) {
    value += 0.25;
    reasons.push(`graph hop via ${candidate.paths.graph.via}`);
  }

  const classAffinity =
    (kind === "ledger" && candidate.class === "ledger") ||
    (kind === "episodic" && candidate.class === "episodic") ||
    (kind === "entity" && candidate.class === "semantic");
  if (classAffinity) {
    value += 0.3;
    reasons.push(`class ${candidate.class} fits ${kind} query`);
  }

  value += 0.1 * candidate.salience;
  if (candidate.pinned) {
    value += 0.2;
    reasons.push("pinned (open debt)");
  }
  if (candidate.status === "pending") {
    value -= 0.15;
    reasons.push("unconfirmed — held for merchant confirmation");
  }

  return { value, reasons };
}

/**
 * Greedy token-budgeted packing, highest score first. The trace records what
 * made the budget and why, and what was left out — the packer never hides
 * its choices.
 */
export function pack(input: {
  candidates: Candidate[];
  ledgerLines: LedgerLine[];
  kind: QueryClassification["kind"];
  budget?: number;
}): PackResult {
  const budget = input.budget ?? DEFAULT_BUDGET;

  // Ledger lines are deterministic facts — they take budget first.
  const ledgerTokens = input.ledgerLines.reduce(
    (sum, line) =>
      sum +
      estimateTokens(
        `${line.counterparty} ${line.kind} ${line.amount} ${line.currency} ${line.dueDate ?? ""}`,
      ),
    0,
  );

  const scored = input.candidates
    .map((candidate) => {
      const { value, reasons } = score(candidate, input.kind);
      return { candidate, value, reasons };
    })
    .sort((a, b) => b.value - a.value);

  const packed: PackedItem[] = [];
  const excluded: PackResult["excluded"] = [];
  let used = ledgerTokens;

  for (const { candidate, value, reasons } of scored) {
    const tokens = estimateTokens(candidate.content);
    if (used + tokens <= budget) {
      used += tokens;
      packed.push({
        memoryId: candidate.memoryId,
        class: candidate.class,
        status: candidate.status,
        content: candidate.content,
        createdAt: candidate.createdAt.toISOString().slice(0, 10),
        score: Number(value.toFixed(3)),
        tokens,
        reasons,
      });
    } else {
      excluded.push({
        memoryId: candidate.memoryId,
        score: Number(value.toFixed(3)),
        reason: `over budget (${tokens} tokens, ${budget - used} left)`,
      });
    }
  }

  return {
    packed,
    excluded,
    ledgerLines: input.ledgerLines,
    budget,
    usedTokens: used,
  };
}
