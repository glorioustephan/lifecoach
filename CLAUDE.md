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
