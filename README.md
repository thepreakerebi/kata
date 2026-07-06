# Kata — the notebook that never forgets

**A memory engine with domain-aware forgetting and confidence-gated writes,
built for businesses that run entirely on WhatsApp.**

Millions of merchants run their whole operation — orders, customers, informal
credit ("book me down, I'll pay Friday"), supplier quotes — inside WhatsApp
chats and paper notebooks. Everything is forgotten: who owes what, who always
buys what, what the supplier quoted last month. Money is lost to forgotten
memory.

Kata sits in the merchant's WhatsApp, accumulates structured memory from the
chat stream, and answers instantly across sessions: *"who owes me money?"*,
*"what did Mama Chidinma order last time?"*, *"what did the rice supplier quote
in May?"*

Built for the [CockroachDB × AWS Hackathon — Build with Agentic Memory](https://cockroachdb-ai.devpost.com/).

## Why not just RAG? (the memory thesis)

Generic memory frameworks apply uniform decay. A merchant's ledger has
**domain-aware forgetting semantics**:

- Preferences drift and fade.
- Resolved transactions archive.
- Contradictions supersede, with history retained.
- **Open debts never decay.** In this memory system, forgetting a debt is a
  bug, not a feature.

And because a wrong debt amount is worse than no memory at all, writes are
**confidence-gated**: low-confidence extracted facts queue for one-tap merchant
confirmation before they enter the ledger, and every fact carries provenance
back to its source message.

## Architecture

```
WhatsApp (Baileys) ─┐
                    ├─→ ingest → LLM extraction → confidence gate → memory store
Dashboard simulator ┘                                      │
                                                           ▼
                                          episodic · semantic · procedural · ledger
                                     (CockroachDB: entity graph + VECTOR embeddings
                                            with distributed vector indexing)
                                                           │
merchant query → classifier → hybrid recall (graph + vector) → token-budgeted
packer (visible trace) → grounded answer
```

- **Memory layer: CockroachDB Cloud.** All four memory classes, the entity
  graph, and the embeddings live in one database — ledger facts and their
  vectors stay transactionally consistent. Semantic recall uses CockroachDB's
  **distributed vector indexing**; the agent's read-only memory introspection
  goes through the **CockroachDB Managed MCP Server**.
- `apps/api` — Bun + Hono: memory engine, extraction pipeline, Baileys
  adapter, benchmark harness. Long-lived process on **Amazon EC2** — Baileys
  holds a persistent socket, so no Lambda.
- `apps/web` — Next.js dashboard: memory brain, recall traces, confirmation
  queue, simulator.
- Models via the **OpenAI API**: chat + extraction + paper-notebook photo OCR
  (vision), embeddings at 1024 dimensions. WhatsApp media lands in
  **Amazon S3**.

*(Architecture diagram, benchmark results, demo video, and deployment proof
land here as they are built.)*

## Running locally

```bash
bun install
cp .env.example .env   # fill in OPENAI_API_KEY, AWS credentials, and the CockroachDB DATABASE_URL
bun run dev:api        # Hono API on :8787
bun run dev:web        # dashboard on :3000
```

## License

[MIT](./LICENSE)
