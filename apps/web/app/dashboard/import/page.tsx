import { ImportPane } from "./import-pane";

export default function ImportPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Notebook import
        </h1>
        <p className="text-sm text-muted-foreground">
          Photograph a paper ledger page and Kata reads it into memory — every
          row through the same confidence gate as chat. On WhatsApp, sending
          the photo to yourself does the same thing.
        </p>
      </header>
      <ImportPane />
    </article>
  );
}
