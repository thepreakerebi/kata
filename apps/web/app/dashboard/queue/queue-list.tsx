"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";

export type PendingMemory = {
  id: string;
  class: string;
  content: string;
  confidence: number;
  structured: Record<string, unknown> | null;
  createdAt: string;
  sourceBody: string | null;
  sourceChannel: string;
};

export function QueueList({ initial }: { initial: PendingMemory[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function act(id: string, action: "confirm" | "reject", body?: object) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/kata/queue/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) throw new Error();
      setItems((current) => current.filter((item) => item.id !== id));
      toast.success(
        action === "confirm" ? "Memory confirmed" : "Memory rejected",
      );
    } catch {
      toast.error("That did not go through. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="inbox"
        title="Queue is clear"
        description="Every extracted fact has been confirmed or rejected. New uncertain facts will wait here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout={!reduce}
            exit={reduce ? undefined : { opacity: 0, x: 24 }}
          >
            <PendingCard
              item={item}
              busy={busyId === item.id}
              onConfirm={(corrections) => act(item.id, "confirm", corrections)}
              onReject={() => act(item.id, "reject")}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function PendingCard({
  item,
  busy,
  onConfirm,
  onReject,
}: {
  item: PendingMemory;
  busy: boolean;
  onConfirm: (corrections?: object) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(item.content);
  const stored = item.structured?.["_ledger"] as
    | { amount?: number; counterparty?: string; kind?: string }
    | undefined;
  const [amount, setAmount] = useState(stored?.amount?.toString() ?? "");
  const [counterparty, setCounterparty] = useState(
    stored?.counterparty ?? "",
  );

  const isLedger = item.class === "ledger";

  function submitCorrection() {
    const corrections: Record<string, unknown> = {};
    if (content !== item.content) corrections.content = content;
    if (isLedger && amount && counterparty) {
      corrections.ledger = {
        kind: stored?.kind ?? "debt",
        amount: Number(amount),
        counterparty,
      };
    }
    onConfirm(Object.keys(corrections).length > 0 ? corrections : undefined);
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{item.class}</Badge>
          confidence {Math.round(item.confidence * 100)}% ·{" "}
          {formatDate(item.createdAt)} · via {item.sourceChannel}
        </CardDescription>
        <CardTitle className="text-base leading-relaxed font-normal">
          {item.content}
        </CardTitle>
        {item.sourceBody ? (
          <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
            “{item.sourceBody}”
          </blockquote>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing ? (
          <fieldset className="flex flex-col gap-4" disabled={busy}>
            <section className="flex flex-col gap-2">
              <Label htmlFor={`content-${item.id}`}>Corrected fact</Label>
              <p className="text-sm text-muted-foreground">
                State the fact the way you would write it in your notebook.
              </p>
              <Textarea
                id={`content-${item.id}`}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </section>
            {isLedger ? (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <span className="flex flex-col gap-2">
                  <Label htmlFor={`who-${item.id}`}>Who owes</Label>
                  <p className="text-sm text-muted-foreground">
                    The customer's name.
                  </p>
                  <Input
                    id={`who-${item.id}`}
                    value={counterparty}
                    onChange={(event) => setCounterparty(event.target.value)}
                  />
                </span>
                <span className="flex flex-col gap-2">
                  <Label htmlFor={`amount-${item.id}`}>Amount (NGN)</Label>
                  <p className="text-sm text-muted-foreground">
                    Numbers only, e.g. 15000.
                  </p>
                  <Input
                    id={`amount-${item.id}`}
                    inputMode="numeric"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </span>
              </section>
            ) : null}
            <footer className="flex flex-wrap gap-2">
              <Button onClick={submitCorrection} disabled={busy}>
                Confirm with corrections
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Back
              </Button>
            </footer>
          </fieldset>
        ) : (
          <footer className="flex flex-wrap gap-2">
            <Button onClick={() => onConfirm()} disabled={busy}>
              Confirm as-is
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Correct first
            </Button>
            <Button variant="ghost" onClick={onReject} disabled={busy}>
              Reject
            </Button>
          </footer>
        )}
      </CardContent>
    </Card>
  );
}
