# lifecoach — Project Guide

@AGENTS.md

---

## Claude Code specifics

### Subagents

- **`ui-engineer`** — builds and modifies `packages/web` UI. Delegate all
  TSX/component work here; it enforces the design system automatically.
- Use `/generate-ui-component [Name] [description]` to scaffold a new component.
- Use `/ui-review [path]` to audit a component against the design system.

### Key commands

```bash
# Type-check the web package only (fast)
pnpm --filter @lifecoach/web typecheck

# Full build
pnpm --filter @lifecoach/web build

# Type-check everything
pnpm -r typecheck

# Run all tests
pnpm -r test
```

### PostToolUse hook

A hook in `.claude/settings.json` runs Prettier + ESLint + `tsc` on every
edited `.tsx` file under `packages/web`. Failures surface as a `systemMessage`
in the transcript — fix them before reporting a task done.

To activate the hook's bash commands without permission prompts, add to
`.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm --silent exec prettier --write *)",
      "Bash(pnpm --silent exec eslint --fix *)",
      "Bash(pnpm --filter @lifecoach/web typecheck)"
    ]
  }
}
```

---

## Council

The repo is maintained by two clearly segregated groups of subagents. **Domain advisors are DEV-TIME ONLY — they never run at app runtime and never write production code.** They produce briefs in `docs/briefs/`; technical engineers consume them.

### Domain Advisory Council (dev-time only, no `Edit` tool)

- **`financial-advisor`** — personal finance + investing briefs → `docs/briefs/finance/`
- **`productivity-coach-advisor`** — habits + productivity briefs → `docs/briefs/productivity/`
- **`holistic-wellness-advisor`** — Ayurveda / Yoga / autoimmunity / adult-ADHD briefs → `docs/briefs/wellness/`

### Technical Development Team (code-owning)

- **`ui-engineer`** — `packages/web` UI (existing)
- **`memory-systems-engineer`** — SQLite + sqlite-vec, schemas, migrations, retrieval
- **`voyage-embeddings-engineer`** — Voyage AI embed/rerank, dim validation, caching
- **`mcp-protocol-engineer`** — MCP servers + Claude Agent SDK tool composition
- **`integrations-engineer`** — Todoist, Capacities, Monarch, Alpaca connectors
- **`monorepo-architect`** — pnpm workspace + Turborepo readiness (designs `turbo.json`, no migration yet)
- **`technical-writer`** — `/docs` as a living dual-audience corpus

### Handoff protocol

Advisors emit `docs/briefs/<domain>/<slug>.md` with frontmatter `consumers: [<engineer-name>, …]` and `status: ready`. Engineers grep for `consumers:` containing their name, implement against the paired `docs/specs/...` (normative contract), then flip `status` ready → in-progress → done and bump `last_implemented`.

## Slash commands

- `/council [topic]` — fan out to all three advisors in parallel; synthesize a cross-domain take.
- `/handoff [brief-path]` — restate a brief in engineer-actionable form and name the right technical agent.
- `/brief-status [domain?]` — table of briefs grouped by status.
- `/arch-snapshot` — one-page contributor snapshot from architecture docs.
- `/generate-ui-component`, `/ui-review` — existing UI skills.
- `/domain-brief`, `/new-plugin`, `/new-migration`, `/doc-refresh`, `/mcp-tool-spec`, `/embedding-eval` — scaffolders for the corpus.

## Hooks

Three `PostToolUse` hooks fire on `Edit|Write` (see `.claude/settings.json`):

1. **`post-edit-tsx.sh`** (existing, 60s) — Prettier + ESLint + `tsc` on every `.tsx` under `packages/web`.
2. **`post-edit-schema.sh`** (10s) — reminds you to bump `docs/reference/schema.md` + `docs/reference/migrations.md` and run `pnpm -r typecheck` after touching `packages/schemas/**`, any migration, or any `*.sql`.
3. **`post-edit-domain-sync.sh`** (10s) — nudges when code edits touch a path referenced by a brief/spec's `code_paths:` frontmatter so `last_implemented` and Changelog stay current.

All three are non-blocking; their reminders appear as `systemMessage` entries in the transcript.
