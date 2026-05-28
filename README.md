# Lifecoach

A personal life/health coach agent. Single user, long-memory, runs on your own hardware. Talks to you (and only you) over a private Tailscale network.

> **What it is, in one sentence:** a Claude-backed agent with persistent typed memory of your life — recipes, lab work, tasks, calendar, goals, projects, conversations — that reasons across all of it to help you make better daily decisions.

## What makes it different

Most LLM apps either dump everything into the prompt (RAG) or forget between sessions. Lifecoach stores everything locally, retrieves on demand, and **compresses over time** through periodic LLM-generated reflections that auto-inject into future turns.

It's not a chatbot. The interesting work happens in the **memory architecture**, not the dialog. Four logical layers backed by one SQLite file:

| Layer | Holds | Loaded when |
|---|---|---|
| **Identity** | Stable profile facts (name, dosha, allergies, default goals) | Always — every turn |
| **Episodic** | Every session + message, append-only | Searched by recency + meaning |
| **Semantic** | Extracted facts + ingested docs + tasks, all embedded | On-demand via `recall` tool |
| **Reflection** | LLM-generated period summaries (daily / weekly / monthly) | Latest auto-injects each turn |

Plus first-class entities for **goals** (with horizons + numeric targets), **projects** (scope bundles), and **insights** (agent-surfaced patterns).

## Architecture at a glance

```
                      ┌──────────────────────────┐
                      │  Claude Agent SDK         │
                      │  (Sonnet 4.6, ~15 tools)  │
                      └────┬──────────────────────┘
                           │
                           ▼
┌──────────────┐  ┌─────────────────────────────────────────┐
│  CLI REPL    │──│              @lifecoach/core             │
│  Web UI      │  │  memory · agent runtime · ingest pipe    │
│  MCP server  │──│  reflector · insighter · forget · export │
└──────────────┘  └────────────────┬─────────────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────────────┐
                  │  SQLite + sqlite-vec                    │
                  │  one file. all state. wal mode.         │
                  └────────────────────────────────────────┘
```

The three interaction surfaces (CLI, MCP, web UI) all drive the **same agent runtime** with the same tool surface. Everything you can do in chat, you can do via the CLI or MCP. No interaction is privileged.

## What's working

**Conversation:**
- Streaming chat with tool calls visible as proof-of-work disclosures
- Markdown rendering + copy-to-clipboard per message
- Past-conversations sheet, deep-link URLs (`/c/$id`) for sharing
- Chat state survives navigation between views

**Memory:**
- Identity / episodic / semantic / reflection layers all live
- Voyage embeddings (with retry, LRU caching, batch writes)
- `forget` flow that purges a document + everything derived from it transactionally

**Ingestion:**
- Drag-drop, paperclip, file watcher, CLI — same pipeline for PDF / CSV / Markdown
- LLM-assisted extraction pulls structured facts + numeric measurements
- Hash-based dedup (drop the same file twice → no-op)

**Integrations:**
- **Todoist** (v1 API): bidirectional sync, dual-write tools, embedded for semantic recall. Background sync every 30 minutes via PM2 cron — no manual `sync` calls needed in production.
- **Capacities**: sweep-based directory mirror (titles + types + URLs embedded for recall), type-aware routing (Person → fact, Project → projects table, Recipe → fact), agent tools for live lookup + save-to-daily-note + save-as-Weblink, automatic write-back of daily/weekly reflections into your Capacities daily note

**Background intelligence:**
- Reflection generator (daily / weekly / monthly) with structured payload (themes, wins, open threads, concerns)
- Insight loop: agent scans recent data, surfaces 0–3 ranked observations into an Inbox view with Discuss / Acted / Dismiss / Snooze actions
- Composed morning briefing at top of Inbox: time-aware greeting, today's tasks, active goal progress, latest reflection
- PM2 ecosystem config supervises the server + Todoist sync (every 30 min) + daily reflection + daily insight pass + weekly reflection

**Portability:**
- `lifecoach export` produces a single `.tar.gz` snapshot (SQLite consistent backup + raw files + manifest with hashes)
- `lifecoach import` validates + restores. Move between machines, take nightly backups, never lose state.

## Stack

- TypeScript + Node 22+, pnpm workspaces
- `@anthropic-ai/claude-agent-sdk` for chat + tool calling
- `@anthropic-ai/sdk` direct for one-shot calls (extraction, reflection, insight generation)
- `better-sqlite3` + `sqlite-vec` for storage
- `voyageai` for embeddings (`voyage-3`, 1024 dims)
- `hono` for HTTP API, served on the home server
- Vite + React 19 + TanStack Router + Tailwind v4 for the web UI
- `radix-ui/react-dialog` for the sheet primitive
- `react-markdown` + `remark-gfm` for chat rendering
- `arctic` for future OAuth (Google Calendar / Gmail)
- `tar` + node `zlib` for snapshot export/import

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Set up the development environment (creates .env.development + data-development/)
pnpm dev:setup
# → Edit .env.development with your API keys

# 3. Initialize the DB + seed your profile
pnpm lifecoach init

# 4. Talk to your coach
pnpm lifecoach chat
```

### Environment variables (`.env.development` for dev, `.env.production` or `.env` on the Mac Mini)

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✓ | Chat, extraction, reflection, insight generation |
| `VOYAGE_API_KEY` | recommended | Embeddings; without it recall falls back to keyword search |
| `VOYAGE_EMBEDDING_MODEL` | optional | Override the Voyage embedding model (default: `voyage-3`) |
| `VOYAGE_RERANK_MODEL` | optional | Override the Voyage reranker used after SQLite candidate search |
| `TODOIST_API_TOKEN` | optional | Todoist task sync |
| `CAPACITIES_API_TOKEN` | optional | Capacities workspace mirror + reflection write-back |
| `CAPACITIES_DEFAULT_SPACE_ID` | optional | Default Capacities space for daily notes and reflection write-back |
| `MONARCH_EMAIL` / `MONARCH_PASSWORD` | optional | Monarch Money sync fallback credentials |
| `MONARCH_SESSION_FILE` | optional | Persisted Monarch browser/session file path |
| `LIFECOACH_SECRET_KEY` | optional | Encrypts stored integration credentials |
| `LIFECOACH_ENV` | optional | `development` or `production` — drives data directory selection |
| `LIFECOACH_DATA_DIR` | optional | Override the data directory path explicitly |
| `LIFECOACH_AUTH` | optional | Set to `off` to disable email auth (dev only) |
| `LIFECOACH_ALLOWED_EMAILS` | optional | Comma-separated email allow-list for auth |
| `PORT` | optional | HTTP server port (default: 3717) |

### Dev vs. production environments

Lifecoach uses **hermetically separated data directories** per environment so local testing never touches production data or embeddings.

```
data-development/     ← local dev (LIFECOACH_ENV=development)
  lifecoach.db
  raw/
  snapshots/
  logs/

data-production/      ← Mac Mini production (LIFECOACH_ENV=production)
  lifecoach.db
  raw/
  snapshots/
  logs/
```

Config is loaded from `.env.{LIFECOACH_ENV}` first, then falls back to `.env`. This lets you maintain a separate Voyage API key, separate Claude key, and separate data per environment.

Production deploy credentials live in GitHub's `production` environment, but
runtime app configuration lives on the Mac Mini. See
[`docs/deployment.md`](docs/deployment.md) for that split and the Capacities
write-back setup.

```bash
# Local dev (uses .env.development, writes to data-development/)
pnpm dev

# Reset local dev data cleanly
pnpm dev:reset
```

### Web UI (local dev)

```bash
pnpm dev
# → Web UI: http://localhost:3718 (Vite dev server with HMR)
# → API:    http://localhost:3717
```

### Web UI (production build)

```bash
pnpm start
# → http://localhost:3717
```

## CLI surface

```
pnpm lifecoach init                   Create DB, run migrations, seed profile
pnpm lifecoach chat                   Interactive REPL
pnpm lifecoach query "..."            One-shot query
pnpm lifecoach status                 Memory + system stats

pnpm lifecoach ingest <path>          Pipe a file through the ingest pipeline
pnpm lifecoach watch                  Auto-ingest files dropped into data-{env}/raw/
pnpm lifecoach forget document <id>   Remove a doc and everything derived from it

pnpm lifecoach sync todoist           Pull active Todoist tasks (also runs automatically via PM2 every 30 min)
pnpm lifecoach sync capacities        Sweep Capacities spaces — mirror objects as documents, route Person/Project/Recipe to first-class entities
pnpm lifecoach reflect daily          Generate a daily reflection
pnpm lifecoach reflect weekly         Generate a weekly reflection
pnpm lifecoach insights generate      Run the insight loop now
pnpm lifecoach insights list          Show active insights

pnpm lifecoach export                 Take a full snapshot to data-{env}/snapshots/
pnpm lifecoach import <archive>       Restore a snapshot
```

## Deploying to a home server

Recommended setup: a Mac mini (or any always-on Linux box) reachable over [Tailscale](https://tailscale.com).

### One-time server setup

```bash
# On the Mac Mini:
mkdir -p /opt/lifecoach
cd /opt/lifecoach
git clone https://github.com/jamesleebaker/lifecoach .
pnpm install

# Create your production environment file (never committed to git)
cp env.example .env.production
# Edit .env.production with production API keys + LIFECOACH_ENV=production

# Initialize the DB
LIFECOACH_ENV=production pnpm lifecoach init

# Start all processes with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # follow the printed sudo command to survive reboots
```

`tailscale serve` exposes the local web UI at `https://<host>.<tailnet>.ts.net` with auto-issued TLS.

### Production deployment from GitHub Actions

Pushes to `main` deploy automatically to the Mac Mini through GitHub Actions +
Tailscale. The workflow verifies the repo, joins the tailnet as an ephemeral
node, SSHes to the Mac Mini, fast-forwards the production checkout, installs
dependencies, builds, runs migrations, reloads PM2, and checks `/health`.

See [`docs/deployment.md`](docs/deployment.md) for the GitHub environment
variables, Tailscale ACL shape, and Mac Mini setup.

### Manual snapshot migration

Use snapshots for backup, restore, or one-time machine migration. The normal
production deploy path should not copy laptop data into production.

The legacy helper scripts are still available for manual operations:

```bash
pnpm deploy:macmini      # export local data, upload, import on the Mac Mini
pnpm deploy:macmini:env  # upload .env.mac-mini to the Mac Mini
```

```bash
# On the source machine
pnpm lifecoach export                       # writes data-{env}/snapshots/lifecoach-<ts>.tar.gz

# Copy the snapshot to the server (scp/AirDrop/etc)

# On the server
LIFECOACH_ENV=production pnpm lifecoach import path/to/snapshot.tar.gz
```

### PM2 managed processes

See [`docs/pm2-setup.md`](docs/pm2-setup.md) for the full PM2 reference. Summary of what runs:

| Process | Schedule | What it does |
|---|---|---|
| `lifecoach-server` | always | Hono HTTP+API server (port 3717) |
| `lifecoach-sync-todoist` | every 30 min | Pull Todoist tasks into local storage |
| `lifecoach-sync-financial` | 02:00 daily | Sync Monarch Money accounts, transactions, and holdings |
| `lifecoach-daily-reflect` | 06:00 daily | Generate morning reflection |
| `lifecoach-insights` | 07:30 daily | Run the insight loop (after reflection) |
| `lifecoach-artifacts` | 08:00 daily | Extract durable artifacts from recent conversations/documents |
| `lifecoach-goal-review` | 18:00 Sunday | Review goal progress before weekly reflection |
| `lifecoach-weekly-reflect` | 19:00 Sunday | Generate weekly reflection |
| `lifecoach-monthly-reflect` | 10:00 on the 1st | Generate monthly reflection |

## Privacy posture

- All structured data lives in `data-{env}/lifecoach.db` on your machine. Gitignored.
- All ingested raw files (PDFs, notes, etc.) live in `data-{env}/raw/`. Gitignored.
- Background jobs record start/finish/failure state in SQLite (`job_runs`) so PM2 cron behavior is auditable beyond log files.
- Outbound calls: Anthropic API (chat, extraction, reflection, insights) and optionally Voyage (embeddings) and Todoist / Capacities APIs. No other third party sees your data.
- Web UI is reachable via Tailscale only — never exposed to the public internet by default. Email allow-list auth is layered on top for defense in depth.

## Status

Active development. Single-user by design — multi-tenancy is not a goal. PRs that match the project's posture (one-person, local-first, agent-as-sidekick) are welcome; PRs that move toward SaaS multi-tenancy are not.

## License

MIT — see [LICENSE](LICENSE). Fork freely.

## Acknowledgements

- The four-layer memory model + the architectural choices here are documented in [`docs/architecture-brief-for-handoff.md`](docs/architecture-brief-for-handoff.md). That brief is intentionally written so someone can build a domain-specific version (work coach, parenting coach, fitness coach) by swapping connectors + system prompt while keeping the memory machinery.
- Visual + UX design system in [`docs/visual-design.md`](docs/visual-design.md) and [`docs/ux-spec.md`](docs/ux-spec.md). They're the source of truth for the surface, not the implementation.
