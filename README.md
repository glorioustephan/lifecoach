# Lifecoach

A personal life/health coach agent built on the Claude Agent SDK with a local SQLite-backed memory.

## Why

I want a single, always-available agent that knows me — my dosha, my recent labs, my microbiome, my recipes, my calendar, my tasks, my recent conversations with it — and can reason holistically across all of it. Most LLM apps either dump everything into the prompt (RAG) or forget between sessions. This one stores everything locally, retrieves on demand, and compresses over time into reflections.

## Architecture

Three layers:

1. **Interaction surfaces** — CLI REPL, CLI one-shot, MCP server. All three drive the same agent.
2. **Agent core** — Claude Agent SDK with a custom tool surface against memory.
3. **Memory + storage** — single SQLite file with `sqlite-vec` for semantic search.

Memory has four logical layers:
- **Identity** — stable profile facts (always injected into system prompt)
- **Episodic** — every session + message, append-only
- **Semantic** — extracted facts + ingested documents, vector-searchable
- **Reflection** — periodic LLM-generated summaries (memory compression)

See [the plan](../../.claude/plans/you-are-responsible-for-rustling-pebble.md) for the full architecture and rationale.

## Layout

```
packages/
├── schemas/      # @lifecoach/schemas — shared zod types
├── core/         # @lifecoach/core — agent runtime, memory, storage
├── cli/          # @lifecoach/cli — interactive REPL + one-shot
├── mcp-server/   # @lifecoach/mcp-server — exposes memory tools over MCP
└── connectors/   # @lifecoach/connectors — Todoist, Calendar, file-drop (stubs)
data/             # local SQLite + raw ingestion + snapshots (gitignored)
```

## Getting started

```bash
# 1. Copy env template and fill in your Anthropic API key
cp env.example .env
# edit .env

# 2. Install
pnpm install

# 3. Initialize the DB + your profile
pnpm lifecoach init

# 4. Chat with your coach
pnpm lifecoach chat
```

## Commands

- `pnpm lifecoach init` — creates `data/lifecoach.db`, runs migrations, seeds your profile
- `pnpm lifecoach chat` — interactive REPL session
- `pnpm lifecoach query "<question>"` — one-shot query
- `pnpm lifecoach status` — memory stats
- `pnpm lifecoach ingest <path>` — pipe a file through ingestion (stubbed)
- `pnpm mcp` — start the MCP server on stdio (for Claude Code, MCP Inspector, etc.)

## Status

**Now working end-to-end:**
- Chat with streaming + tool calls + markdown rendering + copy-to-clipboard
- Past-conversations sheet with semantic search
- Identity, episodic, semantic memory + reflections + insights + goals + projects
- File ingestion (drag-drop, paperclip, watcher, CLI) for PDF/CSV/MD with LLM-assisted fact + measurement extraction
- Forget flow: delete a document + everything derived from it in one transaction
- Todoist read + write + embedded for cross-source recall
- Background intelligence:
  - Daily / weekly / monthly reflections (CLI + agent tool + Memory > Reflections)
  - Insight loop (agent reviews recent data, surfaces ranked observations in the Inbox)
  - Composed morning briefing at the top of the Inbox
- launchd cron schedule for daily reflection + daily insight pass + weekly reflection (see `docs/cron-setup.md`)

**Stubbed:**
- Google Calendar / Gmail / Capacities / Apple Health connectors (planned)
- Local embedder fallback (Voyage is the default)

## Privacy

Everything stays on this machine. SQLite file lives in `./data/lifecoach.db` and is git-ignored. Anthropic API calls and (optionally) Voyage embedding calls go out over the wire — no other third-party hosts your data.
