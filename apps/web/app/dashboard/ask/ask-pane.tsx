"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/format";

type RecallResponse = {
  answer: string;
  kind: string;
  latencyMs: number;
  candidateCount: number;
  pack: {
    budget: number;
    usedTokens: number;
    packed: {
      memoryId: string;
      class: string;
      status: string;
      content: string;
      score: number;
      tokens: number;
      reasons: string[];
    }[];
    excluded: { memoryId: string; score: number; reason: string }[];
    ledgerLines: {
      counterparty: string;
      kind: string;
      amount: string;
      currency: string;
      dueDate: string | null;
    }[];
  };
};

export function AskPane() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RecallResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/kata/recall/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) throw new Error();
      setResult((await response.json()) as RecallResponse);
    } catch {
      setError("The memory could not be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Label htmlFor="question">Your question</Label>
        <p className="text-sm text-muted-foreground">
          Try “who owes me money?” or “what did Mama Chidinma order last
          time?”
        </p>
        <fieldset className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !question.trim()}>
            {busy ? "Recalling…" : "Ask"}
          </Button>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {busy ? (
        <section aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </section>
      ) : null}

      <AnimatePresence mode="popLayout">
        {!busy && result ? (
          <motion.section
            key={result.answer}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="flex flex-col gap-6"
          >
            <Card>
              <CardHeader>
                <CardDescription>
                  Answer · classified as a {result.kind} question ·{" "}
                  {result.latencyMs} ms
                </CardDescription>
                <CardTitle className="text-lg leading-relaxed font-normal">
                  {result.answer}
                </CardTitle>
              </CardHeader>
            </Card>

            <section aria-label="Recall trace" className="flex flex-col gap-4">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-medium">Recall trace</h2>
                <p className="text-sm text-muted-foreground">
                  {result.candidateCount} candidates ·{" "}
                  {result.pack.packed.length} packed · {result.pack.usedTokens}
                  /{result.pack.budget} tokens
                </p>
              </header>

              {result.pack.ledgerLines.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Open ledger (deterministic sweep)
                    </CardTitle>
                    <CardDescription>
                      Money questions never rely on similarity alone — open
                      positions are fetched exactly.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-1 text-sm">
                      {result.pack.ledgerLines.map((line, index) => (
                        <li key={index}>
                          {line.counterparty} — {line.kind}{" "}
                          {formatMoney(line.amount, line.currency)}
                          {line.dueDate ? `, due ${line.dueDate}` : ""}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <ul className="flex flex-col gap-3">
                {result.pack.packed.map((item) => (
                  <li key={item.memoryId}>
                    <Card>
                      <CardContent className="flex flex-col gap-2">
                        <p className="text-sm leading-relaxed">
                          {item.content}
                        </p>
                        <footer className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{item.class}</Badge>
                          {item.status === "pending" ? (
                            <Badge variant="outline">unconfirmed</Badge>
                          ) : null}
                          <Badge variant="outline">
                            score {item.score.toFixed(2)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.reasons.join(" · ")}
                          </span>
                        </footer>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>

              {result.pack.excluded.length > 0 ? (
                <section aria-label="Excluded candidates">
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Left out of the budget
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {result.pack.excluded.map((item) => (
                      <li
                        key={item.memoryId}
                        className="text-xs text-muted-foreground"
                      >
                        score {item.score.toFixed(2)} — {item.reason}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </section>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {!busy && !result ? (
        <EmptyState
          emoji="sparkles"
          title="Nothing recalled yet"
          description="Ask a question above and the full recall trace will appear here."
        />
      ) : null}
    </section>
  );
}
