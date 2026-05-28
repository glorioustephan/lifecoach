---
description: |
  Write an engineer-facing MCP tool spec under docs/specs/mcp-tools/. Use when
  specifying a new MCP tool for the lifecoach MCP server or Alpaca server, or when
  formalizing an existing tool's contract. Supports --brief=<slug> to cross-link to
  a domain advisory brief via pair: frontmatter.
allowed-tools: Read Write Grep
argument-hint: [tool-name]
---

# MCP Tool Spec — /mcp-tool-spec

Write MCP tool spec for: **$1**

Flags:
- `--brief=<slug>` — cross-link to an existing brief (e.g. `--brief=monarch-ingest`)

Parse `$ARGUMENTS` for `--brief=` flag. If present, capture the slug as `<brief-slug>`.

## Step 1 — Check for collision

Grep `docs/specs/mcp-tools/$1.md`. If it already exists, stop:

```
Error: docs/specs/mcp-tools/$1.md already exists. Edit it directly or choose a different tool name.
```

## Step 2 — Resolve brief cross-link (if --brief provided)

If `--brief=<brief-slug>` was given:
1. Glob `docs/briefs/**/<brief-slug>.md` to find the brief.
2. If not found, warn but continue:
   ```
   Warning: brief "<brief-slug>" not found under docs/briefs/. Proceeding without cross-link.
   ```
3. If found, record its path for the `pair:` frontmatter field.
4. After writing the spec, also update the brief's `pair:` field to include `docs/specs/mcp-tools/$1.md`.

## Step 3 — Read template

Read `.claude/skills/mcp-tool-spec/templates/mcp-tool.md`.

## Step 4 — Write spec

Write `docs/specs/mcp-tools/$1.md` with frontmatter:

```yaml
title: $1 MCP Tool Spec
slug: $1
audience: [agents]
owner: mcp-protocol-engineer
status: draft
created: <today>
updated: <today>
source: authored
pair: [<brief-path-if-any>]
```

Body: full MCP tool spec skeleton from the template. Replace `TOOL_NAME` placeholder
with `$1` throughout.

## Step 5 — Update brief (if cross-linking)

If a brief was found in step 2, read that brief file and update its `pair:` frontmatter
list to include `docs/specs/mcp-tools/$1.md` if not already present.

## Step 6 — Print confirmation

```
Created spec:    docs/specs/mcp-tools/$1.md
Cross-linked to: <brief-path or "none">
Owner:           mcp-protocol-engineer

Next steps:
  1. Complete all FILL IN sections in the spec.
  2. Implement the tool in packages/mcp-server/ or packages/mcp-alpaca-server/.
  3. Run pnpm --filter @lifecoach/mcp-server typecheck to validate types.
  4. mcp-protocol-engineer: update docs/reference/mcp-tools.md after implementation.
```

## Reference

- `.claude/skills/mcp-tool-spec/templates/mcp-tool.md` — spec skeleton
- `docs/specs/mcp-tools/` — existing tool specs for consistency
- `.claude/rules/mcp.md` — tool naming and zod schema requirements
- Plan §7 — brief↔spec cross-linking via pair: frontmatter
