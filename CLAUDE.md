# Kata — Project Rules

Kata is a memory engine for businesses that run entirely on WhatsApp (informal
merchants: customers, orders, informal credit/debts, supplier quotes). Entry for
the Global AI Hackathon Series with Qwen Cloud — **Track 1: MemoryAgent**.
Deadline: **July 9, 2026, 11pm GMT+2**. The project must remain deployed and
testable through **July 31, 2026** (judging period).

**Framing rule:** Kata is "a memory engine with domain-aware forgetting and
confidence-gated writes, demonstrated on the informal economy" — never "a
WhatsApp bot." Every artifact (README, video, diagram, dashboard) leads with the
memory system.

## Architecture

- `apps/api` — Bun + Hono. Memory engine, Qwen pipeline, Baileys WhatsApp
  adapter, benchmark harness. Runs as a **long-lived process** (Baileys holds a
  persistent socket) on an Alibaba Cloud ECS instance. Never serverless.
- `apps/web` — Next.js + Tailwind + shadcn/ui + motion. Dashboard: memory brain
  visualization, recall traces, confirmation queue, and the **simulator pane**
  (a chat input that feeds the exact same ingest pipeline as WhatsApp — dev
  console and judge-access fallback; some judges cannot open WhatsApp).
- Postgres + pgvector stores all memory classes and embeddings.
- Qwen models only, via the OpenAI-compatible endpoint
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (chat, extraction,
  embeddings, Qwen-VL for paper-notebook OCR import).

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

## Hackathon submission checklist

Public repo + detectable MIT license · proof of Alibaba Cloud deployment (code
file link + short recording) · architecture diagram · ≤3-min video
(YouTube/Vimeo/Youku, no copyrighted music) · text description · track
identified (Track 1) · blog post link (separate $500 prize).
