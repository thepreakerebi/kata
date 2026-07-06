import { kataFetch } from "@/lib/api";
import { QueueList, type PendingMemory } from "./queue-list";

export default async function QueuePage() {
  const { pending } = await kataFetch<{ pending: PendingMemory[] }>(
    "/api/queue",
  );

  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Confirmation queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Facts the extractor was not sure enough about. Nothing enters the
          ledger without clearing this gate.
        </p>
      </header>
      <QueueList initial={pending} />
    </article>
  );
}
