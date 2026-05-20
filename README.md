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
- Todoist (v1 API): bidirectional sync, dual-write tools, embedded for semantic recall

**Background intelligence:**
- Reflection generator (daily / weekly / monthly) with structured payload (themes, wins, open threads, concerns)
- Insight loop: agent scans recent data, surfaces 0–3 ranked observations into an Inbox view with Discuss / Acted / Dismiss / Snooze actions
- Composed morning briefing at top of Inbox: time-aware greeting, today's tasks, active goal progress, latest reflection
- PM2 ecosystem config supervises the server + daily reflection + daily insight pass + weekly reflection

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
# 1. Copy the env template
cp env.example .env

# 2. Fill in your keys
# - ANTHROPIC_API_KEY (required — chat, extraction, reflection, insight generation)
# - VOYAGE_API_KEY    (required — embeddings; add a $5–10/mo cap, you'll spend pennies)
# - TODOIST_API_TOKEN (optional — Todoist sync)

# 3. Install. Uses pnpm 11.1.0 (corepack will auto-activate from the
# packageManager field in root package.json). If you don't have corepack
# enabled, run `corepack enable` first.
pnpm install

# 4. Initialize the DB + seed your profile
pnpm lifecoach init

# 5. Talk to your coach
pnpm lifecoach chat
```

Web UI:
```bash
pnpm --filter @lifecoach/web build
pnpm --filter @lifecoach/server start
# → http://localhost:3717
```

## CLI surface

```
pnpm lifecoach init                   Create DB, run migrations, seed profile
pnpm lifecoach chat                   Interactive REPL
pnpm lifecoach query "..."            One-shot query
pnpm lifecoach status                 Memory + system stats

pnpm lifecoach ingest <path>          Pipe a file through the ingest pipeline
pnpm lifecoach watch                  Auto-ingest files dropped into data/raw/
pnpm lifecoach forget document <id>   Remove a doc and everything derived from it

pnpm lifecoach sync todoist           Pull active Todoist tasks
pnpm lifecoach reflect daily          Generate a daily reflection
pnpm lifecoach reflect weekly         Generate a weekly reflection
pnpm lifecoach insights generate      Run the insight loop now
pnpm lifecoach insights list          Show active insights

pnpm lifecoach export                 Take a full snapshot to data/snapshots/
pnpm lifecoach import <archive>       Restore a snapshot
```

## Deploying to a home server

Recommended setup: a Mac mini (or any always-on Linux box) reachable over [Tailscale](https://tailscale.com).

1. Install Tailscale on the server and on each device you'll access from
2. `tailscale serve` exposes the local web UI at `https://<host>.<tailnet>.ts.net` with auto-issued TLS
3. Run `pnpm --filter @lifecoach/server start` on the server
4. Start the server + cron jobs with PM2: `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup` — see [`docs/pm2-setup.md`](docs/pm2-setup.md)

To migrate state from another machine:
```bash
# On the source machine
pnpm lifecoach export                       # writes data/snapshots/lifecoach-<ts>.tar.gz

# Copy the snapshot to the server (scp/AirDrop/etc)

# On the server
pnpm lifecoach import path/to/snapshot.tar.gz
```

## Privacy posture

- All structured data lives in `data/lifecoach.db` on your machine. The file is gitignored.
- All ingested raw files (PDFs, notes, etc.) live in `data/raw/`. Gitignored.
- Outbound calls: Anthropic API (chat, extraction, reflection, insights) and optionally Voyage (embeddings). No other third party sees your data.
- Web UI is reachable via Tailscale only — never exposed to the public internet by default. OAuth-based email allow-list is layered on top for defense in depth.

## Status

Active development. Single-user by design — multi-tenancy is not a goal. PRs that match the project's posture (one-person, local-first, agent-as-sidekick) are welcome; PRs that move toward SaaS multi-tenancy are not.

## License

MIT — see [LICENSE](LICENSE). Fork freely.

## Acknowledgements

- The four-layer memory model + the architectural choices here are documented in [`docs/architecture-brief-for-handoff.md`](docs/architecture-brief-for-handoff.md). That brief is intentionally written so someone can build a domain-specific version (work coach, parenting coach, fitness coach) by swapping connectors + system prompt while keeping the memory machinery.
- Visual + UX design system in [`docs/visual-design.md`](docs/visual-design.md) and [`docs/ux-spec.md`](docs/ux-spec.md). They're the source of truth for the surface, not the implementation.
