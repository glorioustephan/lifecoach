# Lifecoach Roadmap

A personal life/health coach built on the Claude Agent SDK with local SQLite memory. Started 2026-05. Single user (James).

## Architectural decisions (locked in 2026-05-18)

- **Deployment**: Mac Mini, accessed via Tailscale (private mesh, free, auto-HTTPS at `https://lifecoach.<tailnet>.ts.net`). No public exposure.
- **Topology**: Embedded core in a Next.js app for the web UI. The CLI and MCP server keep working off the same `@lifecoach/core` package. Single process per service.
- **Data storage**: SQLite + sqlite-vec, file lives at `data/lifecoach.db` on the Mac Mini. Encrypted snapshots to a backup target (TBD: Backblaze B2 or local NAS).
- **Auth (web UI)**: NextAuth with Google OAuth, allow-list of `jamesleebaker@gmail.com` only.
- **Secrets**: `.env` on the Mac Mini for now; consider 1Password CLI later.

---

## Phase 0 — POC ✅ (done)

What's working:
- TS monorepo (`schemas`, `core`, `cli`, `mcp-server`, `connectors`)
- SQLite + sqlite-vec memory: identity, episodic, semantic (facts + docs), reflections, measurements, insights
- Voyage embeddings with retry + LRU query cache
- Agent runtime via Claude Agent SDK with 11 tools (5 fully wired, 6 stubbed)
- Interactive CLI REPL (`pnpm lifecoach chat`) with burst-coalescing for dictation
- MCP server (`pnpm mcp`) exposing the memory tools

## Phase 1 — Seed your data (current)

**Goal**: drop a PDF / CSV / Markdown file into `data/raw/` and have it ingested, chunked, embedded, and recallable.

### Iteration 1.1 — File parsers + ingest pipeline
- [ ] Implement MD parser (gray-matter for frontmatter, plain text body)
- [ ] Implement CSV parser (papaparse) — produce raw text + best-effort measurement extraction
- [ ] Implement PDF parser (pdf-parse) — extract text per page
- [ ] Build a chunking utility (~500 char chunks with ~50 char overlap)
- [ ] Wire `IngestPipeline.ingest()` end-to-end: parse → chunk → batch-embed → persist document + embedding_refs
- [ ] Wire the `ingest_document` agent tool to the pipeline
- [ ] Wire the `lifecoach ingest <path>` CLI command end-to-end
- [ ] Smoke test: ingest a markdown note and recall a phrase from it

### Iteration 1.2 — LLM-assisted extraction
- [ ] Add an extraction pass after ingestion: agent reads document and emits structured facts + measurements
- [ ] For lab PDFs specifically, extract standard analytes (glucose, A1C, cholesterol panel, vitamin D, etc.) as `measurements` rows
- [ ] For recipes, extract ingredients / cooking method / cuisine as `facts`
- [ ] Make the extraction inclusion configurable (`--extract=facts,measurements`)

### Iteration 1.3 — File watcher
- [ ] `lifecoach watch` command: chokidar on `data/raw/`, route new files through the pipeline
- [ ] Idempotency: track ingested file hashes in `meta` table, skip already-seen files
- [ ] CLI status indicator while the watcher is running

### Iteration 1.4 — Backfill + housekeeping
- [ ] `lifecoach reindex` to re-embed everything (useful after switching embedding models or fixing extraction bugs)
- [ ] `lifecoach forget <id>` shortcut
- [ ] `lifecoach export` to dump everything as JSON for backup

**Exit criteria**: you can drop your last 5 lab PDFs, your recipes folder, and a year of journal markdown into `data/raw/` and have meaningful semantic recall + structured measurement queries.

## Phase 2 — Web UI

**Goal**: replace the CLI as the primary surface. Browser-accessible chat on the Mac Mini.

- [ ] New `packages/web` — Next.js 16 App Router
- [ ] Embed `@lifecoach/core` in Server Actions / Route Handlers
- [ ] [prompt-kit](https://www.prompt-kit.com/chat-ui) for the chat surface
- [ ] AI SDK v6 for streaming the agent's responses to the browser
- [ ] NextAuth with Google OAuth, allow-list jamesleebaker@gmail.com only
- [ ] Tailscale serve on the Mac Mini for HTTPS access
- [ ] Mobile-friendly responsive layout (iPhone is the daily-use device)
- [ ] Session list / history view in the sidebar
- [ ] Slash-commands for `/ingest`, `/forget`, `/status`

**Exit criteria**: you can open `https://lifecoach.<tailnet>.ts.net` on your phone, log in once, and talk to your coach without ever opening a terminal.

## Phase 3 — Integrations (one at a time)

Each integration follows the same pattern: connector class implements `Connector`, OAuth/API key in `.env`, scheduled sync, writes flow through the existing ingest pipeline so embeddings happen automatically.

### Phase 3.1 — Todoist (next after Phase 1)
- [ ] OAuth via Todoist's REST API; store token in `meta`
- [ ] Daily sync: tasks, projects, labels, due dates, priorities
- [ ] Write-back tools: `add_task`, `complete_task`, `reschedule_task`, `reprioritize_task`
- [ ] An "inbox triage" tool that re-prioritizes based on calendar + energy patterns

### Phase 3.2 — Google Calendar
- [ ] OAuth via Google
- [ ] Read-only first: events sync into `documents` + relevant ones into `facts`
- [ ] Daily-briefing tool: "what's on my plate today/this week?"

### Phase 3.3 — Gmail
- [ ] OAuth via Google (reuse the GCal scope grant)
- [ ] Read-only summarization: pull last N days, surface time-sensitive items
- [ ] Tool: "anything urgent in my inbox?"

### Phase 3.4 — Capacities.io
- [ ] Likely manual export bridge (their API is beta as of 2026-05)
- [ ] Notes and objects ingest as documents

### Phase 3.5 — Apple Health
- [ ] [Health Auto Export](https://www.healthexport.app/) pushing XML/JSON to a webhook
- [ ] Webhook on the Mac Mini ingests sleep, HRV, steps, weight as measurements

### Phase 3.6 — Lab/blood work
- [ ] Quest/LabCorp don't expose personal APIs — stays file-drop forever
- [ ] But: dedicated parser preset for the common PDF layouts of those two providers

## Phase 4 — Background intelligence

**Goal**: the agent earns its keep by surfacing things you didn't know to ask.

- [ ] Daily-reflection cron (runs at 21:00 local time): summarize the day's interactions, calendar, completed tasks, and any new measurements
- [ ] Weekly-reflection cron (Sunday evening): produce trends + week-ahead recommendations
- [ ] Insight loop: scans recent facts + measurements + reflections every morning, writes 1-3 ranked insights to an "inbox" you see on first open of the web UI
- [ ] Re-prioritization: agent suggests Todoist changes based on calendar density and recent reflections, you approve with one click

## Phase 5 — Lifespan & polish

- [ ] Encrypted nightly snapshots to Backblaze B2 (or local NAS)
- [ ] Append-only audit log of every external write (Todoist mutation, calendar event, etc.) for rollback
- [ ] Confirmation gates on destructive tools (delete fact, reschedule N tasks, etc.) until enough trust is built
- [ ] Per-tool budget so the agent doesn't accidentally re-prioritize 200 Todoist tasks in a loop
- [ ] DB integrity check + automatic vacuum

---

## Right-now starter pack (no code needed)

1. **Just chat for 30 minutes.** Tell it about your week, food preferences, current health stuff, goals. Every fact gets persisted.
2. **Stage your files.** Drop your last 5 lab PDFs, current recipes, and most-referenced notes into `data/raw/` — they'll be there waiting when Phase 1.1 lands.
3. **Add Voyage billing** with a $10 cap. (Done.)
4. **Add Todoist API key to `.env`** so it's ready when Phase 3.1 starts.

---

## Open questions

- Where does the encrypted backup target live? B2 ($0.005/GB/mo, ~$0.01/mo realistic) is the easiest cloud option; local NAS is the no-recurring-cost option.
- How aggressively should the daily insight loop write back to Todoist? Initial answer: don't — surface suggestions in the web UI, user confirms.
- Embedding model: stay on Voyage `voyage-3` (1024-dim) or upgrade when `voyage-3-large` is GA? Stay until quality is a felt problem.
