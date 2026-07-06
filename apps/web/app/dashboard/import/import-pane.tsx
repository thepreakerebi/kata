"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

type WrittenMemory = {
  memoryId: string;
  class: string;
  status: "active" | "pending";
  content: string;
  confidence: number;
  ledgerEntryId: string | null;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

export function ImportPane() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [written, setWritten] = useState<WrittenMemory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That photo is over 8 MB — take a smaller one.");
      return;
    }
    setError(null);
    setBusy(true);
    setWritten(null);

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setPreview(dataUrl);

    try {
      const response = await fetch("/api/kata/import/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl.split(",")[1],
          mimeType: file.type,
        }),
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { written: WrittenMemory[] };
      setWritten(result.written);
    } catch {
      setError("The photo could not be read. Try a clearer shot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="notebook-photo">Ledger page photo</Label>
        <p className="text-sm text-muted-foreground">
          JPEG, PNG, or WebP up to 8 MB. Good light and a flat page read best.
        </p>
        <input
          ref={inputRef}
          id="notebook-photo"
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <footer className="flex gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Reading page…" : "Choose photo"}
          </Button>
        </footer>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {preview ? (
        <figure className="max-w-xs overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Notebook page being imported" />
        </figure>
      ) : null}

      {busy ? (
        <section aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </section>
      ) : null}

      <AnimatePresence>
        {written ? (
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            aria-label="Imported facts"
            className="flex flex-col gap-3"
          >
            <h2 className="text-lg font-medium">
              {written.length === 0
                ? "Nothing readable on that page"
                : `${written.length} fact${written.length === 1 ? "" : "s"} read from the page`}
            </h2>
            <ul className="flex flex-col gap-3">
              {written.map((memory) => (
                <li key={memory.memoryId}>
                  <Card>
                    <CardContent className="flex flex-col gap-2">
                      <p className="text-sm leading-relaxed">
                        {memory.content}
                      </p>
                      <footer className="flex flex-wrap items-center gap-2">
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
                        <em className="text-xs not-italic text-muted-foreground">
                          confidence {Math.round(memory.confidence * 100)}%
                        </em>
                      </footer>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {!busy && !written && !preview ? (
        <EmptyState
          emoji="sparkles"
          title="No page imported yet"
          description="Choose a photo of a credit book or ledger page and watch its rows become memory."
        />
      ) : null}
    </section>
  );
}
