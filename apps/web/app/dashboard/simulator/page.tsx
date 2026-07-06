import { SimulatorPane } from "./simulator-pane";

export default function SimulatorPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Simulator</h1>
        <p className="text-sm text-muted-foreground">
          Feeds the exact same ingest pipeline as WhatsApp — type a chat
          message and watch what the memory extracts from it.
        </p>
      </header>
      <SimulatorPane />
    </article>
  );
}
