# Lifecoach Roadmap

Last updated: 2026-05-23.

A personal life/health coach built on the Claude Agent SDK with local SQLite memory. Single-user, local-first, and designed to run on your own hardware.

## Architectural Decisions

- **Deployment**: home server, currently a Mac Mini-style setup, reached through Tailscale. No public internet exposure by default.
- **Topology**: shared `@lifecoach/core` package used by the CLI, MCP server, Hono API server, and React web UI.
- **Web stack**: Vite + React 19 + TanStack Router + Tailwind v4. The Hono server owns the API and serves the production SPA bundle.
- **Data storage**: SQLite + sqlite-vec in an environment-specific data directory (`data-development/`, `data-production/`, or `LIFECOACH_DATA_DIR`). Snapshots use `lifecoach export` / `lifecoach import`.
- **Auth**: Tailscale is still the primary privacy boundary. The server has an email allow-list middleware seam, but Google OAuth/session auth is not fully implemented yet.
- **Secrets**: env-specific `.env` files on the host machine; no secrets in source.

## Current Status

The original roadmap was written near the POC. Since then, Phases 1, most of Phase 2, Todoist, Capacities, reflections, insights, goals/projects, production deployment, and snapshot portability have landed. The main unfinished pieces are Google OAuth, Google Calendar/Gmail/Apple Health, provider-specific lab parsing, offsite encrypted backups, full external-write confirmation gates, and the new trading integration phase.

Validation notes:

- Git history confirms Phase 1 ingestion, Phase 2 web UI, Todoist, Capacities, reflection/insight work, PM2 scheduling, and production deployment commits.
- Code inspection confirmed the current Hono/Vite architecture rather than the old Next.js plan.
- A temp-DB smoke test on 2026-05-23 ingested `data/raw/drag-drop-test.md`, skipped the duplicate on re-ingest, and recalled the phrase from document embeddings.

---

## Phase 0 - POC ✅ Done

What's working:

- [x] TS monorepo (`schemas`, `core`, `cli`, `mcp-server`, `connectors`, plus `server` and `web`)
- [x] SQLite + sqlite-vec memory: identity, episodic, semantic, reflections, measurements, insights
- [x] Voyage embeddings with retry and LRU query cache
- [x] Agent runtime via Claude Agent SDK with the shared tool surface reused by CLI, MCP, and web
- [x] Interactive CLI REPL (`pnpm lifecoach chat`) with burst-coalescing for dictation
- [x] MCP server (`pnpm mcp`) exposing the memory tools

## Phase 1 - File Ingestion ✅ Done, With One Open Follow-Up

**Goal**: drop a PDF, CSV, or Markdown file into the raw data flow and have it ingested, chunked, embedded, and recallable.

### Iteration 1.1 - File Parsers + Ingest Pipeline ✅

- [x] Implement Markdown parser with `gray-matter` frontmatter and Markdown body preservation
- [x] Implement CSV parser with `papaparse`; raw text is generated and structured extraction happens in the LLM extractor
- [x] Implement PDF parser with `pdf-parse`
- [x] Build chunking utility with overlap; current default is 800 chars / 80 overlap
- [x] Wire `IngestPipeline.ingest()` end-to-end: parse -> chunk -> batch-embed -> persist document + embedding refs
- [x] Wire the `ingest_document` agent tool to the pipeline
- [x] Wire `lifecoach ingest <path>` end-to-end
- [x] Smoke test Markdown ingest and semantic recall

### Iteration 1.2 - LLM-Assisted Extraction ✅ Mostly Done

- [x] Add extraction pass after ingestion: the extractor emits structured facts and measurements
- [x] Extract numeric lab/health measurements when metric, value, unit, and date are clear
- [x] Make extraction configurable with `--no-extract` / `extract: false`
- [ ] Add dedicated Quest/LabCorp parser presets for common PDF layouts
- [ ] Decide whether recipe extraction belongs in ingestion facts, reusable artifacts, or both. The current artifact work is taking the cleaner "reusable recipe artifact" path.

### Iteration 1.3 - File Watcher ✅

- [x] `lifecoach watch` command with `chokidar` on the raw directory
- [x] Hash-based idempotency through `ingested_files`
- [x] CLI status output for `ok`, `skip`, and `err` while the watcher is running

### Iteration 1.4 - Backfill + Housekeeping 🚧

- [ ] `lifecoach reindex` to re-embed everything after model or extraction changes
- [x] `lifecoach forget document <id>` purges a document plus derived facts, measurements, embedding refs, vectors, and ingest-history rows
- [x] `lifecoach export` / `lifecoach import` snapshot SQLite + raw files as a `.tar.gz` with manifest hashes

**Exit criteria**: Markdown/CSV/PDF ingestion and recall are working. Lab PDFs work through generic PDF parsing plus LLM extraction; provider-specific layouts are still a future hardening pass.

## Phase 2 - Web UI 🚧 Mostly Done

**Goal**: replace the CLI as the primary daily surface. Browser-accessible chat on the Mac Mini.

The implementation diverged from the original Next.js plan. The shipped path is Vite + React + TanStack Router for the frontend, with Hono serving API routes and the built SPA.

- [x] New `packages/web` React app
- [x] New `packages/server` Hono API server embedding `@lifecoach/core`
- [x] Streaming chat endpoint with custom SSE reader
- [x] Tool-call disclosures in chat
- [x] Mobile-friendly responsive layout with bottom tabs and desktop rail
- [x] Session list / history view
- [x] Deep links for conversations (`/c/$sessionId`)
- [x] Web file ingest through drag/drop and composer attachment
- [x] Memory view for facts, documents, and reflections
- [x] Tasks view backed by Todoist mirror
- [x] Sources view for connector status
- [x] Inbox view for insights and morning briefing
- [x] Goals/projects surface
- [x] Tailscale / Mac Mini deployment docs and production workflow
- [ ] Google OAuth or equivalent session auth with email allow-list
- [ ] Slash-command palette for `/ingest`, `/forget`, `/status`, `/recall`, `/reflect`

Deferred original implementation details:

- [ ] Next.js App Router
- [ ] NextAuth
- [ ] prompt-kit
- [ ] AI SDK v6 streaming

**Exit criteria**: you can use the web UI from the phone over Tailscale for chat, history, memory, tasks, sources, inbox, and goals. The remaining blocker for the original exit criteria is real login/session auth.

## Phase 3 - Integrations 🚧

Each integration should keep the same general pattern: connector/API client, credentials in env or OAuth store, sync into local storage, and no secrets in Lifecoach memory.

### Phase 3.1 - Todoist ✅ Done

- [x] Todoist API client using API token from env; current client targets Todoist `/api/v1`
- [x] Active-task sync with project names, labels, due dates, priorities, and completion reconciliation
- [x] Background sync every 30 minutes via PM2
- [x] Task content embedded for semantic recall
- [x] Write-back tools: `create_task`, `complete_task`, `reschedule_task`, `update_task`
- [ ] Inbox triage tool that recommends Todoist changes from calendar density + energy patterns

### Phase 3.2 - Google Calendar ⏳ Not Started

- [ ] OAuth via Google
- [ ] Read-only events sync into documents and relevant facts
- [ ] Daily/weekly briefing context: "what's on my plate?"

Current evidence: `packages/connectors/src/google-calendar/index.ts` is still an implementation sketch that throws `NotImplementedError`.

### Phase 3.3 - Gmail ⏳ Not Started

- [ ] OAuth via Google, ideally reusing the Calendar grant
- [ ] Read-only summarization for recent time-sensitive items
- [ ] Tool: "anything urgent in my inbox?"

### Phase 3.4 - Capacities.io ✅ Done

- [x] API-token based Capacities client
- [x] Sweep-based directory mirror into local documents
- [x] Embedded titles/types/URLs for semantic recall
- [x] Type-aware routing: Person and Recipe to facts, Project to projects
- [x] Agent tools for live lookup, daily-note append, Weblink save, and local directory listing
- [x] Reflection write-back to Capacities daily notes
- [x] Sources API and deployment docs for configuration

### Phase 3.5 - Apple Health ⏳ Not Started

- [ ] Health Auto Export or equivalent feed into a local webhook
- [ ] Ingest sleep, HRV, steps, weight, and related metrics as measurements

### Phase 3.6 - Lab/Blood Work 🚧 Partial

- [x] Generic PDF ingest path
- [x] LLM-assisted numeric measurement extraction
- [ ] Dedicated Quest/LabCorp parser presets
- [ ] UI affordance for reviewing extracted lab values before accepting them

## Phase 4 - Background Intelligence ✅ Mostly Done

**Goal**: the agent earns its keep by surfacing things you did not know to ask.

- [x] Daily reflection generator
- [x] Daily reflection PM2 cron, currently 06:00 local
- [x] Weekly reflection generator
- [x] Weekly reflection PM2 cron, currently Sunday 19:00
- [x] Insight loop that scans recent data and writes ranked insights
- [x] Daily insight PM2 cron, currently 07:30 after the daily reflection
- [x] Inbox view with Discuss / Acted / Dismiss / Snooze actions
- [x] Composed morning briefing with tasks, goals, and latest reflection
- [x] Goals and projects promoted to first-class entities
- [ ] Re-prioritization proposals for Todoist based on calendar density and recent reflections, with one-click approval

## Phase 4.5 - Reusable Artifacts 🚧 In Progress

This is present in the current worktree and should be treated as active work until reviewed/merged.

- [x] Shared artifact schema
- [x] Recipe artifact plugin with structured Markdown formatter
- [x] CLI `lifecoach artifacts extract` / `lifecoach artifacts list`
- [x] API routes for list, extract, scan, update, delete, and Capacities write-back
- [x] PM2 daily artifact extraction job at 08:00
- [x] Web Artifacts route and navigation item
- [ ] Final review, browser verification, and product decision on how artifacts interact with ingestion facts

## Phase 5 - Lifespan & Polish 🚧

- [x] Manual snapshots with SQLite backup, raw files, and manifest hashes
- [x] Mac Mini deployment scripts and GitHub Actions production deploy
- [ ] Encrypted nightly snapshots to Backblaze B2 or local NAS
- [ ] Append-only Lifecoach audit log for every external write, especially task mutations and future trading actions
- [ ] Central confirmation gate for destructive tools and external writes
- [ ] Per-tool budget / rate guard so the agent cannot loop through large mutation batches
- [ ] DB integrity check and automatic vacuum
- [ ] Backup freshness warnings before destructive settings actions

## Phase 6 - Financial Trading via Simple Trader MCP ⏳ Planned

**Goal**: let Lifecoach understand portfolio/trading context and help you reason about decisions, while all Alpaca brokerage access remains inside the existing `simple-trader` MCP server.

Safety posture:

- Lifecoach should not hold Alpaca API keys or call Alpaca directly.
- Start paper-only and dry-run-first.
- Read-only portfolio/research tools can be used freely.
- Proposal tools may create proposals, but execution must continue through `simple-trader`'s explicit MCP elicitation flow.
- No cron, reflection, or insight job may place trades.
- Live trading requires the independent gates already built in `simple-trader`.

### Phase 6.1 - MCP Connection

- [ ] Add configuration for a `simple-trader` MCP server command/env, probably disabled unless explicitly configured
- [ ] Teach Lifecoach's agent runtime to attach an external MCP server alongside its in-process memory MCP surface
- [ ] Add startup/status reporting for Simple Trader mode (`paper`, `live`, `dry-run`) without exposing secrets
- [ ] Add a Sources card for Simple Trader with last self-check, last reconciliation, and current mode

### Phase 6.2 - Read-Only Trading Context

- [ ] Expose read-only Simple Trader tools to Lifecoach chat: portfolio snapshot, account status, watchlist, research, discovery, rebalance analysis, decision log
- [ ] Mirror selected portfolio snapshots and decision-log summaries into Lifecoach memory as read-only documents/facts
- [ ] Add trading context to morning briefing only as observation, not instruction
- [ ] Keep trading insights tagged and separable from health/life insights

### Phase 6.3 - Proposal Workflow

- [ ] Allow chat to request `propose_buy`, `propose_sell`, or `propose_quarterly_rebalance` through Simple Trader
- [ ] Persist proposal IDs, expiry, risk flags, allocation impact, and bracket-protection details in Lifecoach
- [ ] Render proposal cards in the web UI with clear paper/live/dry-run mode labels
- [ ] Delegate `execute_proposal` to Simple Trader without bypassing its `YES` elicitation
- [ ] Reconcile proposal/order state after execution or cancellation

### Phase 6.4 - Trading Safety & Audit

- [ ] Paper-mode pilot checklist before any live-mode attempt
- [ ] Explicit live-mode warning banner whenever Simple Trader reports `live`
- [ ] Lifecoach-side audit entries for proposal creation, execution attempts, cancellations, and reconciliations
- [ ] Kill switch that disables proposal/execution tools from Lifecoach while leaving read-only tools available
- [ ] Daily/session budget display that mirrors Simple Trader guard config

### Phase 6.5 - Polish

- [ ] Portfolio/trading view or Sources detail panel with positions, watchlist drift, open orders, revisit-by dates, and links to Alpaca dashboard orders
- [ ] Reflection prompt guardrail: trading reflections summarize decisions and risks, never manufacture trade recommendations from mood alone
- [ ] Export/import coverage for mirrored trading context without copying Simple Trader's secrets or broker credentials

Open questions:

- Should Lifecoach persist full proposal/order mirrors, or only summaries that point back to `simple-trader`'s `trading.db`?
- Should trading insights appear in the main Inbox, or in a separate financial inbox?
- What paper-trading evidence is required before enabling live mode from Lifecoach at all?

---

## Right-Now Starter Pack

1. Keep using the web UI as the daily surface over Tailscale.
2. Finish/review the active Artifacts workstream.
3. Add `lifecoach reindex` before changing embedding models or extraction strategy.
4. Decide whether Google OAuth is worth doing before Calendar/Gmail, or whether Tailscale-only remains acceptable for now.
5. For trading, keep `simple-trader` as the safety boundary and integrate Lifecoach as an MCP client, not as a direct Alpaca client.

## Open Questions

- Where does the encrypted backup target live: B2, local NAS, or both?
- Should external write tools use one shared confirmation framework across Todoist, Capacities, future Google writes, and Simple Trader?
- Should artifacts become the canonical home for recipes, replacing recipe facts in semantic memory?
- How much financial/trading context should influence general life coaching, if any?
