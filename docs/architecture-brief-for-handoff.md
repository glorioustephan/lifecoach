# Architecture brief: building a personal long-memory agent

> Read this end to end before you start. It describes a working system (a personal life/health coach called Lifecoach) so you can build a similar system for a different domain — in this case, a daily-work agent with access to JIRA, Slack, GitHub, calendar, etc. The architectural pattern is domain-agnostic; only the connectors, extractors, and system prompt change.

---

## What you're building

An agent that:

1. **Talks to one user, in long-running conversation.** Single-user — no orgs, no tenancy, no sharing. The agent has its own identity, voice, and accumulated knowledge about that user.
2. **Has durable memory that grows over time.** Every interaction, every ingested document, every external sync produces persisted, semantically-recallable artifacts. The agent never starts cold.
3. **Reasons across heterogeneous data via tool use.** It can call typed tools to read/write memory, query external systems, and pull structured context on demand.
4. **Ingests files and external systems into the same memory store.** PDFs, CSVs, markdown notes, JIRA tickets, Slack threads, GitHub PRs — all flow into the same SQLite + vector index and become recallable by the same `recall` tool.
5. **Is deployable to a single machine over a private network.** Home server (Mac mini + Tailscale in our case). Not multi-tenant SaaS.

What it is **not**:

- Not a chatbot demo. The system is built around the *memory*, not the dialog.
- Not LangChain. Avoid the framework — it adds abstractions you'll want control over.
- Not an MCP wrapper. We expose an MCP surface, but the agent isn't *driven* by MCP — it's driven by the Claude Agent SDK with custom tools.

---

## The mental model: four memory layers

The conceptual core of the whole system. Treat these as **logical** memory types, all backed by the same physical SQLite file.

| Layer | What lives here | When to write | When to read |
|---|---|---|---|
| **Identity** | Stable facts: name, role, team, stack, default editor, OOO dates, etc. ~1 KB total. | When the user states something that is true-for-a-long-time about themselves. | Always — every turn injects identity into the system prompt. |
| **Episodic** | Full append-only log of every session + every message. | After every turn. | Searchable by recency + by meaning. Used to answer "what did I say about X last week?" |
| **Semantic** | Extracted facts (typed statements with category, subject, body, validity dates) + ingested documents (raw text from JIRA tickets, Slack threads, etc.) | When the agent learns something durable (via tool call) or when ingestion runs. | On demand via the `recall` tool. |
| **Reflection** | Periodic LLM-generated summaries (daily, weekly, sprint, etc.) | Cron-driven, by the agent itself. | Latest weekly is appended to the system prompt on every turn for steady-state awareness. |

**Loading strategy per agent turn:** identity profile (~1 KB) is always in the system prompt. Latest weekly reflection is appended (~2 KB). Everything else is fetched on demand by the agent via `recall(query, scope, limit)`. This avoids the classic RAG mistake of stuffing the prompt; it stays small while letting the agent dig deeper when it judges that it needs to.

---

## Storage: single SQLite file with sqlite-vec

**Why SQLite:** local-first by default, zero infra, single file you can `scp` to back up, ACID, transactionally safe vector + structured writes in the same statement. Better-sqlite3 (synchronous, native binding) is the right driver for a Node app — no async ergonomics tax.

**Why sqlite-vec:** lets you co-locate vector indices with relational data in the same DB. No separate Pinecone/Qdrant cluster, no two-write consistency problem, no extra deploy. KNN queries take a `MATCH ?` predicate; you wrap them in a CTE before joining metadata.

**Schema sketch** (paraphrased — adapt to your domain):

```sql
-- Identity
CREATE TABLE profile (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);

-- Episodic
CREATE TABLE sessions (id TEXT PK, started_at INTEGER, ended_at INTEGER, summary TEXT);
CREATE TABLE messages (id TEXT PK, session_id TEXT FK, role TEXT, content TEXT, tool_use TEXT, created_at INTEGER);

-- Semantic
CREATE TABLE facts (
  id TEXT PK, category TEXT, subject TEXT, body TEXT, data TEXT,
  source TEXT, confidence REAL, valid_from INTEGER, valid_to INTEGER, created_at INTEGER
);
CREATE TABLE documents (id TEXT PK, source TEXT, mime TEXT, title TEXT, body TEXT, metadata TEXT, ingested_at INTEGER);

-- Time-series (for your domain: maybe deploy frequency, ticket throughput, code-review SLA)
CREATE TABLE measurements (id TEXT PK, metric TEXT, value REAL, unit TEXT, recorded_at INTEGER, source_document_id TEXT FK, created_at INTEGER);

-- Reflections
CREATE TABLE reflections (id TEXT PK, period_start INTEGER, period_end INTEGER, kind TEXT, body TEXT, created_at INTEGER);

-- External-system mirror (in our case Todoist; in yours: JIRA tickets, GitHub PRs)
CREATE TABLE tasks (
  id TEXT PK, external_id TEXT, external_source TEXT, content TEXT, description TEXT,
  project_id TEXT, project_name TEXT, labels TEXT, priority INTEGER,
  due_at INTEGER, completed_at INTEGER, url TEXT,
  created_at INTEGER, updated_at INTEGER, synced_at INTEGER
);
CREATE UNIQUE INDEX idx_tasks_external ON tasks(external_source, external_id) WHERE external_id IS NOT NULL;

-- Idempotency for file/sync ingestion
CREATE TABLE ingested_files (
  hash TEXT PK, path TEXT, document_id TEXT FK ON DELETE CASCADE,
  size_bytes INTEGER, ingested_at INTEGER
);

-- Vector store: single sqlite-vec virtual table for everything
CREATE VIRTUAL TABLE embeddings USING vec0(embedding FLOAT[1024]);
-- Pointer table — maps rowid in `embeddings` to the entity it describes
CREATE TABLE embedding_refs (
  embedding_rowid INTEGER PK, ref_type TEXT, ref_id TEXT,
  chunk_index INTEGER DEFAULT 0, text TEXT, created_at INTEGER
);
CREATE INDEX idx_embedding_refs_target ON embedding_refs(ref_type, ref_id);
```

Notes:
- All timestamps are unix-ms integers. No SQLite `DATETIME` columns; the ergonomics aren't worth it.
- `embeddings` is one table; `ref_type` discriminates ('fact', 'document', 'message', 'reflection', 'task', etc.). The `recall` tool filters by ref_type to scope a query.
- `PRAGMA journal_mode = WAL; foreign_keys = ON;` always.
- The sqlite-vec extension needs to be loaded at runtime via `sqliteVec.load(db)` before any KNN query.

---

## KNN queries (don't get this wrong)

sqlite-vec requires `k = ?` or a `LIMIT` **inside** the virtual-table query, before any JOIN. The wrong way silently breaks:

```sql
-- WRONG — sqlite-vec errors with "A LIMIT or k = ? constraint is required"
SELECT … FROM embeddings e JOIN embedding_refs r ON … WHERE e.embedding MATCH ? LIMIT 10

-- RIGHT — CTE the KNN, then JOIN/filter
WITH knn AS (
  SELECT rowid, distance FROM embeddings WHERE embedding MATCH ? AND k = ?
)
SELECT knn.rowid, knn.distance, r.ref_type, r.ref_id, r.chunk_index, r.text
FROM knn
JOIN embedding_refs r ON r.embedding_rowid = knn.rowid
[WHERE r.ref_type = ?]
ORDER BY knn.distance ASC
LIMIT ?
```

When filtering by `ref_type`, over-fetch in the KNN (e.g. `k = limit * 5`) so post-filter results aren't starved. Convert distance to a [0,1] score with `1 / (1 + distance)`.

---

## Embeddings: Voyage with retry + LRU + batching

- **Provider:** Voyage AI (`voyage-3`, 1024 dims). Anthropic-recommended; high quality; fast. ~$0.06/1M tokens — pennies a month for personal-scale use.
- **Free tier is 3 RPM / 10K TPM** — unusable for agentic memory. Add a payment method day 1 with a low cap ($5–10/mo).
- **Wrap every call with retry + jitter** on 429/5xx (we use `withRetry` from `packages/core/src/util/retry.ts`). Voyage hiccups and you want self-healing.
- **LRU cache query embeddings** (256 entries). The same recall query within a session shouldn't re-embed.
- **Batch writes.** Voyage `embed()` accepts arrays. When ingesting a doc with 200 chunks, send them in one call (the API caps at ~128 per request — chunk accordingly).
- **Always store the dim in a `meta` table** so you can detect mismatches when the model changes.
- **Embedder is an interface** (`Embedder`) — the Voyage impl is one of several. Keep a `NullEmbedder` that returns no vectors and lets recall degrade to keyword-LIKE fallback. Useful for dev without a token.

---

## Agent runtime: Claude Agent SDK + custom tools

Use `@anthropic-ai/claude-agent-sdk`. Don't roll your own loop.

The SDK gives you:
- `query({ prompt, options })` returning an async iterable of events
- `createSdkMcpServer({ name, version, tools })` — in-process tool registry
- `tool(name, description, zodInputSchema, handler)` — typed tool definitions

Your job:
1. Build a tool surface that the agent actually wants to use. For us this is `get_profile`, `set_profile`, `recall`, `remember`, `forget`, `list_recent_interactions`, `list_tasks`, `create_task`, `complete_task`, `reschedule_task`, `update_task`, `query_measurements`, `record_measurement`, `ingest_document`, `summarize_period`, `record_insight`. For you it might be `list_tickets`, `transition_ticket`, `comment_on_ticket`, `search_slack`, `summarize_thread`, `list_open_prs`, `request_review`, etc.
2. Compose a system prompt that **always** includes identity + latest reflection, then describes the agent's role and policies (e.g. "be conservative when writing facts; cite sources; confirm before destructive external writes").
3. Persist each user + assistant turn to `messages` at well-defined points (user turn before query, assistant turn after stream ends).

Pick **Sonnet** as the default chat model. Tool use is identical across Claude models; Sonnet is ~5x cheaper than Opus and more than capable for this. Pin via env var so you can override per task (e.g. extraction can be Sonnet, big-reasoning analysis can be Opus).

---

## Ingest pipeline

The pattern that makes "drop a file → agent knows about it" trivial:

```
detect-type → parse (md/csv/pdf/json) → chunk (~800 chars, 80 overlap)
            → batch-embed → persist documents + embedding_refs
            → LLM-extract (optional) → persist facts + measurements
            → record file hash for idempotency
```

Key decisions:
- **Idempotency by content hash** (SHA-256 streamed). Same file dropped twice → second is a no-op. Use a dedicated `ingested_files` table keyed by hash.
- **LLM extraction is conservative.** The extractor is a single Anthropic `tool_use` call with a typed schema (zod → JSON Schema). It receives the document body + an identity blurb, and is instructed to return EMPTY arrays for general reference material. Only emit facts for user-specific information ("user said X about themselves"). Only emit measurements when metric + value + unit + date are all unambiguous.
- **Chunking is paragraph-aware with carryover.** Don't tokenize; just split on `\n\n`, pack into chunks up to size, add `overlap` chars from the tail of the previous chunk. Good enough for prose, lab PDFs, recipe notes. Token-aware splitting is a future optimization.
- **Pipeline emits typed progress events** (`parse`, `chunk`, `embed batch N/M`, `persist`, `extract`, `extract-result`, `done`) so CLI/UI can render progress.

---

## Connectors (pluggable; adapt for your domain)

For Lifecoach: Todoist, Google Calendar, Apple Health, file-drop. For your work agent: **JIRA, Slack, GitHub, Google Calendar/Gmail, Linear, Notion, Confluence, your IDE/PR review tooling**.

Each connector:
- Implements a small interface (`Connector { name, description, sync(ctx) }`)
- Is opt-in via env var (e.g. `JIRA_API_TOKEN`, `SLACK_USER_TOKEN`)
- Mirrors upstream state into local SQLite tables (don't proxy live — agent should answer "what's open?" instantly without an API round-trip)
- Uses the upsert-by-external-id pattern + a reconcile pass (anything missing upstream gets marked closed/completed locally)
- Embeds content into the same `embeddings` table with a domain-appropriate `ref_type` ('ticket', 'thread', 'pr', etc.) so the unified `recall` finds it

The agent gets typed tools for read (`list_tickets`, `search_messages`) and write (`transition_ticket`, `post_message`). For destructive external writes, gate behind explicit confirmation in v1 — you want to build trust before letting the agent fire and forget.

For JIRA/Slack specifically:
- **JIRA**: REST API v3, OAuth or PAT. Sync issues + comments + transitions. Worth a separate webhook receiver later so you don't poll every minute.
- **Slack**: User token (xoxp) for personal use; Bot token (xoxb) if you ever go org-wide. Pull DMs + threads where you're mentioned. Avoid pulling whole-channel — too noisy.

---

## Interaction surfaces

A single embedded core, three surfaces:

1. **CLI REPL** — `lifecoach chat`. Fast iteration during dev. Stays useful forever.
2. **MCP server** (stdio) — exposes the same tool surface to Claude Code or any MCP-aware client. ~1 day of work because the tools already exist.
3. **Web UI** — Vite + React 19 + TanStack Router + Tailwind v4 + a streaming bridge from the SDK to the browser. Single Node process serves API + built bundle.

The three surfaces share the same `@core` package and the same memory tools. Build core first; surfaces are thin.

---

## What to copy versus adapt for a JIRA/Slack work agent

**Copy as-is:**
- The four-layer memory model
- SQLite + sqlite-vec storage approach
- The agent runtime + tool registration shape
- The retry + LRU embedder wrapper
- The ingest pipeline (parsers/chunker/extractor are domain-agnostic)
- The CTE-based KNN query
- The "store everything as facts + documents + embed it all" instinct

**Adapt:**
- System prompt + voice → professional, work-context
- Identity profile keys → name, role, team, stack, current sprint, manager, OOO
- Schemas: add `tickets`, `threads`, `prs`, `commits`, `meetings` as needed (modeled on our `tasks` table)
- Connectors: build for JIRA, Slack, GitHub, Calendar, Gmail. Each gets a typed read tool + write tool + sync function.
- Reflection cadence: daily standup prep (morning) + weekly retro (Friday afternoon)
- Extraction prompt: target ticket state changes, decisions in threads, review feedback, PR risk signals

**Avoid:**
- Health-domain extraction targets
- Ayurvedic / personal-life voice in the agent
- Local-disk file-drop as the primary ingest path (work data flows from APIs, not Finder drops)

---

## Implementation gotchas (lessons from the build)

These cost real time. Don't repeat them:

1. **`dotenv.config()` defaults to `override: false`.** If your shell has `ANTHROPIC_API_KEY=""` exported (common in dev), dotenv silently refuses to load the real value from `.env`. Always pass `{ override: true }`.

2. **`PRAGMA foreign_keys = ON`** is required for SQLite to enforce `ON DELETE CASCADE`. Default is OFF. The bare `sqlite3` CLI doesn't set this either, so any cleanup script you write needs to set it explicitly.

3. **`process.cwd()` shifts under `pnpm --filter`.** If you anchor paths against CWD (data dir, .env path, ingest paths), they'll silently land in the wrong directory. Resolve relative paths against a `findWorkspaceRoot()` that walks up for `pnpm-workspace.yaml` or `.git`.

4. **TanStack Router unmounts on URL changes** — including `history.replaceState`. Don't call `navigate()` from inside a streaming event handler; the route remounts and your in-flight stream's React state vanishes. Lift chat state into a provider at the router root.

5. **The Claude Agent SDK emits text deltas across separate content blocks.** A `text` block followed by `tool_use` followed by another `text` block streams as deltas with no boundary marker. You'll see "...the right place.Got it..." concatenated unless you track tool boundaries server-side and inject `\n\n` when text resumes.

6. **React 19 dropped the global JSX namespace.** Add a `react-jsx.d.ts` that re-publishes it globally if you want `JSX.Element` return types without per-file imports.

7. **better-sqlite3 native build is skipped by default in pnpm 10.** Add `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` to the root package.json.

8. **The LLM extractor will hallucinate user facts from reference material** unless you explicitly instruct it to return empty arrays for general/reference docs. Always pass an identity blurb so it can disambiguate "this is about the user" from "this is general knowledge." Be especially careful with anything where the document refers to a person by name — they may not be the user.

9. **Always store embedding dim in a `meta` table** and check on startup. Changing models mid-flight is a catastrophic dimension mismatch.

10. **Build the unsubscribe/forget flow alongside the ingest flow.** Anything you ingest, you should be able to fully purge — document + facts derived from it + measurements + embeddings + the file hash record. Skipping this leaves you doing manual SQL surgery later (ask me how I know).

---

## Recommended build order

1. SQLite + schema + repositories (1 day)
2. Embedder interface + Voyage impl + retry + LRU (half day)
3. Memory layer (identity + episodic + semantic + reflections) (1 day)
4. Claude Agent SDK runtime + first 5 tools (get_profile, recall, remember, set_profile, list_recent_interactions) (1 day)
5. CLI REPL (half day)
6. Ingest pipeline (parsers + chunker + extractor) — start with markdown only (1 day)
7. First connector end-to-end (pick JIRA or Slack, whichever you depend on more) (1–2 days)
8. MCP server (half day — reuses tools)
9. Web UI: Vite + React + TanStack + streaming chat + 6 views — most time goes into the chat view, the rest can be stubs (~3 days)
10. Reflection cron + insight loop (1 day)
11. Backup + forget flow (half day)

Total: ~2 weeks of evenings + weekends for a polished v1.

---

## Recommended stack

Match it unless you have a strong reason not to:

- TypeScript, Node 22+, pnpm workspaces
- `@anthropic-ai/claude-agent-sdk`
- `@anthropic-ai/sdk` (direct, for non-agent calls like the extractor)
- `better-sqlite3` + `sqlite-vec` + `ulid`
- `voyageai`
- `zod` for validation everywhere
- `hono` + `@hono/node-server` for the API
- Vite + React 19 + TanStack Router + TanStack Query + Tailwind v4 + Radix Dialog + Lucide for the UI
- `react-markdown` + `remark-gfm` for chat rendering
- `arctic` for OAuth flows when you add Google/Atlassian/Slack
- `vitest` for tests, `tsx` for dev

Keep dependencies small. Most of the architectural complexity belongs to *you*, not to libraries.
