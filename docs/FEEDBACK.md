# Feedback on the CockroachDB AI tools

Notes from building Kata — a memory engine whose entire store (four memory
classes, entity graph, transactional ledger, and embeddings) lives in one
CockroachDB Cloud Basic cluster. Everything below happened for real during
this project; commit history has the receipts.

## Distributed Vector Indexing — the good and the gaps

**The good.** `VECTOR(1024)` + `CREATE VECTOR INDEX` did exactly what the
pitch says. Semantic recall queries hit a `vector search` plan node (visible
in `EXPLAIN`), latency stayed flat as the memory store grew during the
benchmark's 228-message ingest, and — the reason we chose CockroachDB — the
embedding column sits in the same row universe as the ledger it describes.
When a merchant corrects a fact, content and vector update in one
transaction. No sync job, no consistency gap. That claim ("no separate
vector store to maintain") held up in practice.

**Gap 1: ORM tooling doesn't know `CREATE VECTOR INDEX`.** Drizzle emits the
`vector(1024)` column type fine, but there is no way to declare the
CockroachDB vector index in the schema, so it lives in a hand-written,
idempotent setup script that must run after every migration. A documented
recipe (or drizzle/Prisma extensions) for CRDB vector indexes would remove
the sharpest edge of adoption.

**Gap 2: `drizzle-kit push` hangs against CockroachDB.** Its enum resolver
falls into an interactive prompt (a TTY requirement `--force` does not
bypass) when introspecting CRDB catalogs. `generate` + `migrate` works
cleanly — but nothing in the docs warns you, and the failure mode is a
spinner, not an error. Worth a doc note in the "AI/ORM quickstarts."

**Gap 3: parameter typing on catalog-ish queries.** `postgres.js`
placeholders occasionally fail with "could not determine data type of
placeholder" where PostgreSQL would infer. Casting explicitly fixes it, but
an agent (or a developer's copilot) writing queries trips on this reliably.

## SERIALIZABLE + agents: lean into the retry contract

Concurrent ingest (multiple chats extracting facts that touch shared entity
rows) produced `40001 RETRY_SERIALIZABLE` aborts immediately — by design.
The docs page linked from the error is good; what's missing is a
copy-pasteable retry wrapper for the JS ecosystem. Ours is ~20 lines
(exponential backoff + jitter, also retrying `23505` insert races) and it
turned the whole problem into a non-event. Shipping such a helper in a
`@cockroachdb/js-helpers` package — or as an Agent Skill — would spare every
AI-built app the same discovery loop. Related tuning note: read-heavy
transactions (our fuzzy entity resolution reads the merchant's entity set
inside the write transaction) widen the conflict footprint; the practical
fix was lowering ingest concurrency, which an ORM-level doc note could have
predicted for us.

## Managed MCP Server

One config snippet from the Connect dialog into `.mcp.json`, one OAuth
approval, and Claude Code had read-only introspection of the cluster —
schema, slow queries, plans — with no proxy to run and no credentials to
paste. This is the correct trust model (read-only by default mattered: we
let the tool loose without thinking twice). Two wishes: (1) an option to
scope the OAuth grant to a single database rather than the cluster, and
(2) surfacing `EXPLAIN`-with-vector-index output through an MCP tool would
make "is my vector index actually being used?" a one-question check for
agents.

## Agent Skills repo

The schema-design and operations skills read like distilled docs, which is
useful, but the highest-value additions for AI-first builders would be the
sharp edges above as machine-executable checks: "verify vector index is
used," "wrap transactions in retry logic," "avoid drizzle-kit push." The
skills that encode *pitfalls* will save agents more time than the ones that
encode happy paths.

## Basic-tier observability

The Cloud console's SQL activity view was enough to watch the benchmark
hammer the cluster (~31k RUs during early testing) and confirm the vector
index was doing the work. A small nicety: exposing "top statements by
retries" on Basic tier would have pointed us to the 40001 hotspot faster.
