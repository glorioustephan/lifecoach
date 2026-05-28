# lifecoach — Agent Standards

> Shared instructions for all AI coding agents (Claude Code, Cursor, Windsurf, etc.).
> Claude Code reads this via `@AGENTS.md` in `CLAUDE.md`. Other tools read this directly.

---

## Project overview

**lifecoach** is a pnpm monorepo. The primary app is `packages/web`:
Vite + React 19 + TanStack Router + Tailwind CSS v4.

```
lifecoach/
├── packages/
│   └── web/          # Main app — Vite + React 19 + Tailwind v4
│       ├── src/
│       │   ├── components/   # ui/, chat/, shell/, ingest/, inbox/
│       │   ├── lib/          # cn.ts, api.ts, utils.ts, hooks…
│       │   ├── routes/       # TanStack Router file-based routes
│       │   └── styles/       # theme.css (tokens), global.css
│       └── components.json   # shadcn config
├── scripts/          # Sync + automation scripts (Node.js)
├── docs/             # Design system + UX specs
└── pnpm-workspace.yaml
```

---

## UI design system — the four rules

**Read `docs/ui-design-system.md` and `docs/prompt-kit-parity.md` before
creating any UI.** These are the single source of truth.

### Rule 1 — prompt-kit is the base layer

For any chat/AI/agent UI surface (messages, composer, loaders, tool calls,
reasoning, sources), check the catalog in `docs/ui-design-system.md` §1.
If a prompt-kit component covers the need, use it. Never hand-roll a chat
primitive when prompt-kit ships one.

Install via shadcn (from `packages/web`):
```bash
npx shadcn@latest add "https://prompt-kit.com/c/<name>.json"
```

### Rule 2 — Semantic theme tokens only

Use ONLY semantic token classes from `packages/web/src/styles/theme.css`.
Never use raw Tailwind palette (`bg-zinc-*`, `text-gray-*`, `dark:*` color
overrides). Dark/light parity depends on semantic aliases exclusively.

**Use:** `bg-surface`, `text-fg`, `text-fg-muted`, `text-fg-faint`,
`bg-surface-elevated`, `border-border`, `border-border-subtle`,
`bg-accent`, `text-accent`, `text-accent-fg`,
`*-success-*`, `*-warning-*`, `*-destructive-*`

**Never use:** `bg-zinc-800`, `text-gray-400`, `text-red-800`, `dark:text-*`

### Rule 3 — Wrap, don't fork

When a prompt-kit component needs app-specific behavior, wrap it in a thin
component in the relevant feature dir. Never copy-paste and diverge prompt-kit
source. The only sanctioned edit to prompt-kit source is replacing hardcoded
raw colors with semantic tokens at adoption time.

### Rule 4 — Button casing rule

Two button primitives coexist in this project:
- `~/components/ui/Button` (PascalCase) — lifecoach button, semantic tokens, **use this**
- `@/components/ui/button` (shadcn lowercase) — used internally by prompt-kit only

Always import `Button` from `~/components/ui/Button` in lifecoach-authored files.

---

## Import aliases

Both `~/` and `@/` resolve to `packages/web/src/`. Prefer `~/` in lifecoach
files; prompt-kit uses `@/` internally. Both aliases are configured in
`vite.config.ts` and `tsconfig.json`.

---

## Code conventions

- Components: PascalCase file + named export (`export const Foo = ...`). No default exports.
- Hooks: `useFoo`, camelCase file (`use-foo.ts`).
- Classes: always merge with `cn(...)` from `~/lib/cn`.
- Icons: `lucide-react`, `strokeWidth={1.75}`, sizes via `size-4` / `size-3.5`.
- TypeScript strict: no `any` without documented justification.
- Every component handles: empty, loading, error, disabled states.
- Chat components also handle: streaming state.

---

## Do not modify (other agents own these)

- `packages/web/src/styles/theme.css` — token values (only the token-bridge agent may add tokens)
- `packages/web/src/styles/global.css` — resets and focus-visible
- Backend services in `scripts/` — separate domain

---

## Verify your work

```bash
pnpm --filter @lifecoach/web typecheck   # fast; run after every tsx edit
pnpm --filter @lifecoach/web build       # full build; run before marking done
```

---

## Package map

| Package | Purpose |
|---|---|
| `@lifecoach/core` | Stateful logic — storage, memory layers, agent runtime, integrations, embeddings, ingest pipeline, artifacts |
| `@lifecoach/schemas` | Shared TypeScript types + Zod schemas (identity, episodic, semantic, financial, task, artifact, …) |
| `@lifecoach/cli` | CLI surface (`chat`, `query`, `ingest`, `sync`, `reflect`, `insights`, `artifacts`, `export`, `import`, `reset`) |
| `@lifecoach/server` | Hono HTTP API + web host (routes for chat, memory, tasks, financial, briefing, …) |
| `@lifecoach/web` | Vite + React 19 + TanStack Router UI with Tailwind v4 + prompt-kit |
| `@lifecoach/mcp-server` | MCP stdio server exposing the memory tool surface to external MCP clients |
| `@lifecoach/mcp-alpaca-server` | Separate MCP server for Alpaca investment data (read-only, advisory) |
| `@lifecoach/connectors` | External integration adapters (Todoist, Capacities, Monarch, Alpaca) |

**Dependency direction:** `web` → `server` → `core` → `schemas`. Never reverse. No cross-package relative imports — use `@lifecoach/<pkg>` everywhere.
