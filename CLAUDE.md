# Kata — Project Rules

Kata is a memory engine for businesses that run entirely on WhatsApp (informal
merchants: customers, orders, informal credit/debts, supplier quotes). Entry for
the **CockroachDB × AWS Hackathon — "Build with Agentic Memory"**
(cockroachdb-ai.devpost.com). Deadline: **August 18, 2026, 5pm ET**. The demo
app must remain deployed and functional through the judging period ending
**September 15, 2026**.

**Framing rule:** Kata is "a memory engine with domain-aware forgetting and
confidence-gated writes, demonstrated on the informal economy" — never "a
WhatsApp bot." Every artifact (README, video, diagram, dashboard) leads with the
memory system.

## Architecture

- `apps/api` — Bun + Hono. Memory engine, extraction pipeline, Baileys
  WhatsApp adapter, benchmark harness. Runs as a **long-lived process**
  (Baileys holds a persistent socket) on **Amazon EC2**. Never Lambda — the
  socket must stay up.
- `apps/web` — Next.js + Tailwind + shadcn/ui + motion. Dashboard: memory brain
  visualization, recall traces, confirmation queue, and the **simulator pane**
  (a chat input that feeds the exact same ingest pipeline as WhatsApp — dev
  console and judge-access fallback; judges must be able to test without
  WhatsApp).
- **CockroachDB Cloud is the single memory store** — all four memory classes,
  the entity graph, AND embeddings via CockroachDB's `VECTOR` type with
  **distributed vector indexing**. No separate vector store; the pitch is
  transactional consistency between ledger facts and their embeddings.
- Models via the **OpenAI API** (chat + extraction + notebook-photo OCR +
  embeddings truncated to 1024 dims). The AWS Free plan blocks **all** Bedrock
  model invocation ("Operation not allowed" account-wide — verified
  2026-07-06), so AWS's role is the deployment layer, not inference. Model
  names come from env, never hard-coded.

### Required hackathon integrations (must be meaningful, not just initialized)

- **CockroachDB tools (need ≥2):**
  1. **Distributed Vector Indexing** — semantic recall over memory embeddings.
  2. **Managed MCP Server** (`https://cockroachlabs.cloud/mcp`) — the agent's
     read-only memory-introspection path (analytics questions about its own
     memory) and the Claude Code dev workflow; document both.
  3. **Agent Skills Repo** (open source) — use during schema/perf work and
     document as the optional tools-feedback item.
- **AWS services (need ≥1, meaningfully integrated):** Amazon EC2 (the
  agent's long-lived runtime), Amazon S3 (WhatsApp media + notebook photos).

## Memory engine design (locked)

- Memory classes: **episodic** (raw events), **semantic** (distilled
  facts/preferences), **procedural** (merchant corrections/style), **ledger**
  (debts/credits — special class).
- **Domain-aware forgetting:** preferences decay, resolved transactions archive,
  contradictions supersede with history retained, **open debts never decay**.
  Forgetting is demotion, never deletion.
- **Confidence-gated writes:** low-confidence extracted facts queue for merchant
  confirmation before committing; every fact carries provenance to its source
  message.
- Recall: query classifier → hybrid retrieval (entity-graph walk + vector
  search) → token-budgeted packer that emits a visible trace of what it chose
  and why.
- Benchmark: deterministic ground truth (synthetic merchant histories with known
  facts), scored against full-context and naive-RAG baselines. Never
  LLM-self-graded.

## UI rules (non-negotiable)

- **Semantic HTML only. No raw `<div>` or `<span>` anywhere, no matter what.**
  Use `main`, `section`, `article`, `header`, `footer`, `nav`, `aside`, `ul`,
  `li`, `figure`, `p`, `output`, etc., plus shadcn/ui components. If a layout
  wrapper is needed, pick the semantically correct element — there is always
  one.
- Components come from **shadcn/ui** — do not hand-roll what shadcn provides.
  This project's shadcn generation is built on **Base UI, not Radix**: compose
  with the `render` prop (e.g. `<Button render={<Link href="…" />}>label</Button>`),
  not `asChild`. Next.js here is **v16** — check `node_modules/next/dist/docs/`
  before using APIs that may have changed.
- Loading states use shadcn **Skeleton** — never "Loading…" text or bare
  spinners.
- Page-level empty states use a shared **EmptyState** component (3D
  fluent-emoji + subtle motion, no background, no border).
- No input placeholders on labeled fields — use helper text between label and
  control.
- Animate mount/unmount/reflow with **motion/react**; always respect
  `useReducedMotion`.
- Row left/right edges align with their section header edges — no per-row
  indents.
- Error copy is concise and actionable; never leak raw backend errors to the UI.

## Database workflow (CockroachDB)

- Schema changes: edit `apps/api/src/db/schema/`, then `bun run db:generate` →
  `bun run db:migrate` → `bun run db:setup`. Migrations are **committed** —
  judges must be able to reproduce the database.
- **Never use `drizzle-kit push` against CockroachDB** — its enum resolver
  hangs on an interactive prompt (CRDB introspection confuses it) and
  `--force` does not bypass it. generate + migrate works cleanly.
- Vector indexes are CockroachDB-specific DDL (`CREATE VECTOR INDEX`) that
  drizzle-kit cannot emit; they live in `apps/api/src/db/setup.ts`
  (idempotent) and must be re-run after schema changes touching embeddings.
- `postgres.js` placeholders can fail on CRDB catalog queries with "could not
  determine data type of placeholder" — cast explicitly or use `sql.unsafe`
  for introspection-style queries.

## Engineering rules

- **Commit at every milestone.** Small, frequent commits — never one large
  batch.
- No source file over 1000 lines — split at the natural seam.
- TypeScript everywhere; validate all external input (HTTP bodies, WhatsApp
  messages, LLM outputs) with zod at the boundary.
- React/Next.js work follows Vercel React best practices (no waterfalls,
  parallel fetches, minimal client bundles, RSC-first).
- This repo is **public and MIT-licensed** (hackathon requirement). Clean-room
  code only — nothing copied from private projects.

## Security rules

- **No secrets in the repo, ever.** Real values live in `.env` (gitignored);
  `.env.example` documents shape only. The Baileys auth state directory is
  gitignored — it contains live WhatsApp session credentials.
- All DB access goes through Drizzle ORM — no string-built SQL.
- API: `hono/secure-headers` on every route, CORS locked to the dashboard
  origin, rate limiting on public endpoints, request bodies size-capped.
- The dashboard is authenticated (simple signed-session; judges get demo
  credentials in testing instructions). No unauthenticated write endpoint
  except the WhatsApp inbound path, which validates sender identity.
- Log hygiene: never log message bodies, phone numbers, or extracted facts at
  info level; redact PII in error reports.
- LLM output is untrusted input: parse with zod, never eval, never interpolate
  into SQL/shell/HTML.

## Scope cut lines (do NOT build)

Payments, outbound reminders/campaigns, multi-merchant onboarding, agent
autonomy (agent messaging customers on the merchant's behalf), SMS/USSD, mobile
app.

## Judging criteria (build toward these)

Agentic Memory Design (CockroachDB in a production-grade memory role, beyond
toy queries) · Technical Implementation (correct, safe use of vector index +
MCP + ccloud) · Real-World Impact · Production Readiness (secure, observable,
resilient, access-controlled) · Creativity & Originality.

## Hackathon submission checklist

Public repo + detectable MIT license (About section) · **functional demo app
URL** · ≤3-min video (YouTube/Vimeo, public, shows the CockroachDB memory
layer at work) · text description · write-up of which CockroachDB tools were
used and what the agent did with them · write-up of which AWS services were
used and how · architecture diagram (optional but do it) · feedback on
CockroachDB AI tools (optional but do it).
