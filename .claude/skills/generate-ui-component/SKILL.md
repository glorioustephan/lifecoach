---
description: |
  Generate a new lifecoach UI component following the design system. Use when
  asked to create a new React component, add a UI primitive, or implement a
  new feature surface in packages/web. Covers catalog lookup, prompt-kit
  installation, semantic token application, a11y checks, and typecheck verification.
allowed-tools: Read Write Edit Bash Glob Grep
argument-hint: [ComponentName] [brief description]
---

# Generate UI Component

Create a new component for `packages/web` following the lifecoach design system.
Component name: **$ARGUMENTS**

## Step 1 — Catalog check (required first)

Read `docs/ui-design-system.md` §1 to determine the decision for this component:

- **Adopt** → import the prompt-kit component directly from `components/ui/`. Done.
- **Wrap** → install the prompt-kit base, then create a thin lifecoach wrapper.
- **Build** → no suitable prompt-kit equivalent; build from scratch following §3.

If unsure, search the catalog table for keywords matching the component's purpose.

## Step 2 — Install prompt-kit (Adopt or Wrap path only)

Run from `packages/web`:

```bash
cd /path/to/packages/web
npx shadcn@latest add "https://prompt-kit.com/c/<component-name>.json"
```

Prerequisites (check `docs/prompt-kit-parity.md` §5 if any are missing):
- `components.json` must exist (shadcn already initialized — it does)
- Required Radix primitives installed for the target component
- Token bridge in `theme.css` (already present — verify `--color-background` alias exists)

## Step 3 — Determine file location

| Component type | Location |
|---|---|
| Generic primitive / prompt-kit install | `src/components/ui/` |
| Chat feature wrapper | `src/components/chat/` |
| Shell / navigation | `src/components/shell/` |
| Ingest flow | `src/components/ingest/` |
| Inbox / briefing | `src/components/inbox/` |

## Step 4 — Write the component

Apply all design system rules:

**Tokens** — semantic only; never raw palette:
```tsx
// CORRECT
<div className="bg-surface border border-border rounded-md p-4">
  <p className="text-fg text-sm">Content</p>
  <span className="text-fg-muted text-xs">Label</span>
</div>

// WRONG — breaks light mode
<div className="bg-zinc-800 border border-zinc-700 rounded-md p-4 dark:text-gray-100">
```

**Component shape** (PascalCase, named export, no default export):
```tsx
import { cn } from "~/lib/cn";

interface FooProps {
  className?: string;
  // ... typed props, no `any`
}

export const Foo = ({ className, ...props }: FooProps): JSX.Element => {
  return (
    <div className={cn("bg-surface rounded-md", className)}>
      {/* content */}
    </div>
  );
};
```

**Button** — always import from `~/components/ui/Button` (PascalCase),
never from `@/components/ui/button` (shadcn lowercase) in lifecoach files.

**Icons** — `lucide-react`, `strokeWidth={1.75}`, size via `size-4`.

**Wrap pattern** (if Wrap decision):
```tsx
// components/chat/MyWrapper.tsx
import { PromptKitComponent } from "~/components/ui/prompt-kit-component";
import { useAppContext } from "~/lib/app-context";

export const MyWrapper = (): JSX.Element => {
  const { relevantState } = useAppContext();
  return <PromptKitComponent lifecoachProp={relevantState} />;
};
```

## Step 5 — Required states checklist

- [ ] **Empty state** — use `EmptyState` or show meaningful placeholder text
- [ ] **Loading state** — use `CircularLoader` (inline) or `TextDotsLoader` ("typing")
- [ ] **Error state** — use `SystemMessage` (chat) or destructive border + `AlertCircle` (inline)
- [ ] **Disabled state** — `disabled:opacity-50 disabled:cursor-not-allowed`
- [ ] **Streaming state** (chat components only) — `ThinkingBar` + `ScrollButton` awareness

## Step 6 — A11y checklist

- [ ] All interactive elements have visible focus (`focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg`)
- [ ] Icon-only buttons have `aria-label`
- [ ] Decorative icons have `aria-hidden`
- [ ] Disclosure components have `aria-expanded` + `aria-controls`
- [ ] Touch targets ≥ 44px (icon buttons: `size-9` + padding)
- [ ] No positive `tabindex`
- [ ] Semantic HTML elements used where appropriate

## Step 7 — Verify

```bash
pnpm --filter @lifecoach/web typecheck
```

Zero TypeScript errors required. Fix any before completing.

## Reference

- `docs/ui-design-system.md` — full rules, token table, composition patterns
- `docs/prompt-kit-parity.md` — gap matrix, install order, compatibility risks
- `packages/web/src/styles/theme.css` — authoritative token source
