---
description: |
  Review a UI component or file against the lifecoach design system. Use when
  asked to audit a component, check a TSX file for design-system violations,
  or validate that a component follows prompt-kit, token, and a11y rules.
allowed-tools: Read Glob Grep Bash
argument-hint: [path/to/Component.tsx]
disable-model-invocation: true
---

# UI Review — /ui-review

Audit: **$ARGUMENTS**

Read the file(s) specified and evaluate against the lifecoach design system.
Also read `docs/ui-design-system.md` before starting if not already in context.

## Review checklist

For each item, output: PASS / FAIL / N/A with a one-line note.

### Prompt-kit baseline
- [ ] Does the component overlap with a prompt-kit primitive in `docs/ui-design-system.md` §1?
      If yes: is it correctly Adopted, Wrapped, or is it hand-rolling something it shouldn't?
- [ ] If Wrapping: does the wrapper stay thin and delegate internals to prompt-kit?
- [ ] Is prompt-kit source copied and forked instead of wrapped? (FAIL if yes)

### Token usage
- [ ] Zero raw palette classes (`*-zinc-*`, `*-gray-*`, `*-red-*`, `text-slate-*`, etc.)
- [ ] Zero `dark:*` color overrides (dark mode is handled by theme.css, not Tailwind variants)
- [ ] All colors reference semantic tokens (`bg-surface`, `text-fg-muted`, `border-border`, etc.)
- [ ] Classes merged with `cn()` from `~/lib/cn`

### Composition & naming
- [ ] PascalCase filename + named export (`export const Foo = ...`)
- [ ] No default exports for components
- [ ] Compound / slot pattern used for multi-part components (not monolithic props-soup)
- [ ] Lives in the correct directory (ui/ vs chat/ vs shell/ vs ingest/ vs inbox/)

### Button import rule
- [ ] Imports `Button` from `~/components/ui/Button` (not from `@/components/ui/button`)

### Import alias
- [ ] Lifecoach-authored imports use `~/` alias (not `../../` relative paths out of src/)

### Required states
- [ ] Empty state handled
- [ ] Loading state handled (uses `Loader` or `TextShimmer`, not a custom spinner)
- [ ] Error state handled (uses `SystemMessage` for chat banners or destructive tokens inline)
- [ ] Disabled state: `disabled:opacity-50 disabled:cursor-not-allowed`

### Accessibility
- [ ] Every interactive element is keyboard-reachable (no positive tabindex)
- [ ] Icon-only buttons have `aria-label`
- [ ] Decorative icons have `aria-hidden`
- [ ] Disclosure elements have `aria-expanded` + `aria-controls`
- [ ] Touch targets ≥ 44px for icon buttons
- [ ] Focus ring not removed (`:focus-visible` preserved)

### Icons
- [ ] Icons from `lucide-react`
- [ ] `strokeWidth={1.75}` on icon instances (or inherited from a wrapper that sets it)

### TypeScript
- [ ] No `any` types without documented justification

## Output format

```
## UI Review: <ComponentName>

### Summary
<PASS/NEEDS WORK/FAIL> — <one sentence>

### Findings
| Check | Result | Note |
|-------|--------|------|
| prompt-kit baseline | PASS | Uses Adopted Loader correctly |
| Token usage | FAIL | `bg-zinc-800` on line 23 — replace with `bg-surface` |
| ...

### Recommended fixes
1. Line 23: replace `bg-zinc-800` with `bg-surface`
2. ...
```

If the file passes all checks: say "Design-system compliant — no changes needed."
