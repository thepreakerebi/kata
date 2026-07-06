import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
      <header className="flex max-w-2xl flex-col items-center gap-4 text-center">
        <Badge variant="secondary">
          CockroachDB × AWS Hackathon · Build with Agentic Memory
        </Badge>
        <h1 className="text-5xl font-semibold tracking-tight">Kata</h1>
        <p className="text-xl text-muted-foreground">
          The notebook that never forgets. A memory engine with domain-aware
          forgetting and confidence-gated writes, built for businesses that run
          entirely on WhatsApp.
        </p>
      </header>
      <nav aria-label="Primary" className="flex gap-3">
        <Button render={<Link href="/dashboard" />}>Open dashboard</Button>
        <Button
          variant="outline"
          render={
            <Link
              href="https://github.com/thepreakerebi/kata"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          View source
        </Button>
      </nav>
    </main>
  );
}
