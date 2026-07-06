import { AskPane } from "./ask-pane";

export default function AskPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ask</h1>
        <p className="text-sm text-muted-foreground">
          Ask the memory a question and watch exactly how the answer was
          recalled — every candidate, score, and packing decision.
        </p>
      </header>
      <AskPane />
    </article>
  );
}
