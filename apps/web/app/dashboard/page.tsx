import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { FadeIn } from "@/components/fade-in";
import { kataFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";

type MemoryRow = {
  id: string;
  class: "episodic" | "semantic" | "procedural" | "ledger";
  status: string;
  content: string;
  confidence: number;
  salience: number;
  pinned: boolean;
  confirmedVia: string | null;
  createdAt: string;
};

type MemoriesResponse = {
  memories: MemoryRow[];
  counts: { active: number; pending: number; archived: number };
};

type LedgerResponse = {
  open: {
    id: string;
    counterparty: string;
    kind: string;
    amount: string;
    currency: string;
    dueDate: string | null;
  }[];
};

const CLASS_ORDER = ["ledger", "semantic", "episodic", "procedural"] as const;

const CLASS_LABEL: Record<string, string> = {
  ledger: "Ledger — money facts",
  semantic: "Semantic — durable facts & preferences",
  episodic: "Episodic — events",
  procedural: "Procedural — merchant instructions",
};

export default async function MemoryPage() {
  const [{ memories, counts }, { open }] = await Promise.all([
    kataFetch<MemoriesResponse>("/api/memories"),
    kataFetch<LedgerResponse>("/api/memories/ledger"),
  ]);

  const totals = new Map<string, number>();
  for (const entry of open) {
    if (entry.kind !== "debt") continue;
    totals.set(
      entry.currency,
      (totals.get(entry.currency) ?? 0) + Number(entry.amount),
    );
  }
  const owedSummary =
    [...totals.entries()]
      .map(([currency, total]) => formatMoney(total, currency))
      .join(" + ") || "Nothing open";

  const byClass = new Map<string, MemoryRow[]>();
  for (const memory of memories) {
    if (memory.status === "archived") continue;
    const list = byClass.get(memory.class) ?? [];
    list.push(memory);
    byClass.set(memory.class, list);
  }

  return (
    <article className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
        <p className="text-sm text-muted-foreground">
          Everything Kata currently remembers, and how alive each memory is.
        </p>
      </header>

      <section
        aria-label="Overview"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <FadeIn as="article">
          <Card>
            <CardHeader>
              <CardDescription>Active memories</CardDescription>
              <CardTitle className="text-3xl">{counts.active}</CardTitle>
            </CardHeader>
          </Card>
        </FadeIn>
        <FadeIn as="article" delay={0.05}>
          <Card>
            <CardHeader>
              <CardDescription>Awaiting confirmation</CardDescription>
              <CardTitle className="text-3xl">{counts.pending}</CardTitle>
            </CardHeader>
          </Card>
        </FadeIn>
        <FadeIn as="article" delay={0.1}>
          <Card>
            <CardHeader>
              <CardDescription>Open debts</CardDescription>
              <CardTitle className="text-3xl">
                {open.filter((entry) => entry.kind === "debt").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </FadeIn>
        <FadeIn as="article" delay={0.15}>
          <Card>
            <CardHeader>
              <CardDescription>Owed to you</CardDescription>
              <CardTitle className="text-2xl">{owedSummary}</CardTitle>
            </CardHeader>
          </Card>
        </FadeIn>
      </section>

      {open.length > 0 ? (
        <FadeIn>
          <h2 className="mb-3 text-lg font-medium">Open ledger</h2>
          <figure className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.counterparty}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatMoney(entry.amount, entry.currency)}
                    </TableCell>
                    <TableCell>{formatDate(entry.dueDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </figure>
        </FadeIn>
      ) : null}

      {memories.length === 0 ? (
        <EmptyState
          emoji="brain"
          title="Nothing remembered yet"
          description="Send a message in the simulator or connect WhatsApp, and extracted facts will appear here."
        />
      ) : (
        CLASS_ORDER.filter((memoryClass) => byClass.has(memoryClass)).map(
          (memoryClass, index) => (
            <FadeIn key={memoryClass} delay={index * 0.05}>
              <h2 className="mb-3 text-lg font-medium">
                {CLASS_LABEL[memoryClass]}
              </h2>
              <ul className="flex flex-col gap-3">
                {byClass.get(memoryClass)!.map((memory) => (
                  <li key={memory.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-3">
                        <p className="text-sm leading-relaxed">
                          {memory.content}
                        </p>
                        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {memory.pinned ? (
                            <Badge>pinned — never decays</Badge>
                          ) : null}
                          {memory.status === "pending" ? (
                            <Badge variant="secondary">unconfirmed</Badge>
                          ) : null}
                          {memory.confirmedVia === "corrected" ? (
                            <Badge variant="outline">
                              corrected by merchant
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(memory.createdAt)} · confidence{" "}
                            {Math.round(memory.confidence * 100)}%
                          </span>
                          <span className="flex min-w-32 flex-1 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              salience
                            </span>
                            <Progress
                              value={memory.salience * 100}
                              aria-label={`Salience ${Math.round(memory.salience * 100)}%`}
                            />
                          </span>
                        </footer>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </FadeIn>
          ),
        )
      )}
    </article>
  );
}
