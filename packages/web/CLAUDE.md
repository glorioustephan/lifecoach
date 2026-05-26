# packages/web — Web UI Rules

Loaded on demand when Claude works in `packages/web/`.
Supplements root `CLAUDE.md` + `AGENTS.md` with web-specific detail.

---

## Design system enforcement

Every `.tsx` file you create or edit in this package must comply with
`docs/ui-design-system.md`. Summary of non-negotiables:

1. **prompt-kit base layer** — check §1 catalog before writing any chat primitive.
2. **Semantic tokens only** — never `bg-zinc-*`, `text-gray-*`, `dark:text-*`.
3. **Wrap, don't fork** — thin wrapper in feature dir; never copy prompt-kit source.
4. **Button import** — `~/components/ui/Button` (PascalCase), never shadcn lowercase.

---

## Component directory map

```
src/components/
  ui/       — prompt-kit installs + shadcn primitives + lifecoach generics
  chat/     — Composer, Message, MessageActions, ToolCallDisclosure, ChatView…
  shell/    — Shell, RailNav, TabBar, GlobalStatus
  ingest/   — DropZone, IngestProvider, IngestSheet
  inbox/    — BriefingPanel
src/lib/
  cn.ts     — cn() helper (clsx + tailwind-merge)
  utils.ts  — re-export shim: `export { cn } from "./cn"` (satisfies @/lib/utils)
  api.ts    — typed API client
src/styles/
  theme.css — @theme tokens + prompt-kit token bridge + keyframes (ONLY token source)
  global.css — resets, focus-visible, scrollbar, safe-area
src/routes/ — TanStack Router file-based routes
```

---

## shadcn / prompt-kit setup

`components.json` is already configured:
- Aliases: `@/components`, `@/lib/utils`, `@/components/ui`
- Style: default, neutral base color, CSS variables on
- Icon library: lucide

To install a prompt-kit component (run from this directory):
```bash
npx shadcn@latest add "https://prompt-kit.com/c/<name>.json"
```

Install order and Radix prerequisites: see `docs/prompt-kit-parity.md` §5.

After installing `loader` or `text-shimmer`, register their keyframes in
`src/styles/theme.css` under `@keyframes` (the `--animate-*` tokens already
exist; only add missing `@keyframes` blocks if needed).

---

## Tailwind v4 notes

- No `tailwind.config.js`. All tokens live in `@theme {}` in `theme.css`.
- Keyframe animations declared as `@keyframes` + `--animate-*` CSS custom properties.
- Dark mode: `@custom-variant dark` — do NOT use `dark:` color utilities.

---

## Type-check command (fast path)

```bash
pnpm --filter @lifecoach/web typecheck
```

Run this after every `.tsx` edit. The PostToolUse hook also runs it automatically.

---

## Composition pattern (prompt-kit style)

New composite components follow `Root` + named slots + context hook:

```tsx
// Root provides context
// Named sub-components consume context
// Export context hook only if children need it

export const MyRoot = ({ children }: { children: React.ReactNode }) => (
  <MyContext.Provider value={...}>{children}</MyContext.Provider>
);
export const MyContent = () => { const ctx = useMyContext(); ... };
```

Never prop-drill the same value through three layers; use context.
