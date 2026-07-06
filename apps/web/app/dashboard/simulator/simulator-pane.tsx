"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";

type WrittenMemory = {
  memoryId: string;
  class: string;
  status: "active" | "pending";
  content: string;
  confidence: number;
  ledgerEntryId: string | null;
};

type Exchange = {
  id: string;
  body: string;
  written: WrittenMemory[];
};

export function SimulatorPane() {
  const [body, setBody] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/kata/simulator/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as {
        messageId: string;
        written: WrittenMemory[];
      };
      setExchanges((current) => [
        { id: result.messageId, body, written: result.written },
        ...current,
      ]);
      setBody("");
    } catch {
      setError("The message could not be ingested. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Label htmlFor="message">Chat message</Label>
        <p className="text-sm text-muted-foreground">
          Write it the way a real chat reads, e.g. “Mama Chidinma took 2 bags
          of rice, she go pay 45k Friday”.
        </p>
        <Textarea
          id="message"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
          rows={3}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <footer>
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Extracting…" : "Send into memory"}
          </Button>
        </footer>
      </form>

      {busy ? (
        <section aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-20" />
        </section>
      ) : null}

      {exchanges.length === 0 && !busy ? (
        <EmptyState
          emoji="chat"
          title="No messages yet"
          description="Everything you send lands in the same pipeline WhatsApp messages do: extraction, confidence gate, memory store."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {exchanges.map((exchange) => (
              <motion.li
                key={exchange.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
                      “{exchange.body}”
                    </blockquote>
                    {exchange.written.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nothing worth remembering was found in this message.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {exchange.written.map((memory) => (
                          <li
                            key={memory.memoryId}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <Badge variant="secondary">{memory.class}</Badge>
                            {memory.status === "pending" ? (
                              <Badge variant="outline">
                                queued for confirmation
                              </Badge>
                            ) : (
                              <Badge>committed</Badge>
                            )}
                            {memory.ledgerEntryId ? (
                              <Badge>ledger entry</Badge>
                            ) : null}
                            <p className="w-full text-sm leading-relaxed sm:w-auto sm:flex-1">
                              {memory.content}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
