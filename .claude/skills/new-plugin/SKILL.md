---
description: |
  Scaffold a new lifecoach plugin by creating a paired advisory brief and engineer spec
  linked via pair: frontmatter. Use when a domain advisor or engineer is ready to
  formally specify a new plugin (finance, productivity, or wellness integration). Creates
  docs/briefs/$2/$1.md and docs/specs/plugins/$1.md atomically.
allowed-tools: Read Write Glob Grep
argument-hint: [plugin-name] [domain]
---

# New Plugin — /new-plugin

Scaffold plugin **$1** in domain **$2**.

## Step 1 — Validate inputs

`$2` must be one of: `finance`, `productivity`, `wellness`. If not, stop:

```
Error: domain "$2" is not valid. Choose from: finance, productivity, wellness.
```

Check for collisions — glob both paths:
- `docs/briefs/$2/$1.md`
- `docs/specs/plugins/$1.md`

If either exists, stop and report which file(s) already exist.

## Step 2 — Resolve owner

| Domain | Brief owner |
|--------|-------------|
| `finance` | `financial-advisor` |
| `productivity` | `productivity-coach-advisor` |
| `wellness` | `holistic-wellness-advisor` |

Engineer spec owner is always `memory-systems-engineer` initially (handoff list customizable).

## Step 3 — Read templates

Read both templates:
- `.claude/skills/domain-brief/templates/brief.md`
- `.claude/skills/new-plugin/templates/spec.md`

## Step 4 — Write the brief

Write `docs/briefs/$2/$1.md` with frontmatter:

```yaml
title: $1 Plugin Brief
slug: $1
audience: [agents, humans]
owner: <domain-owner>
status: draft
created: <today>
updated: <today>
source: authored
consumers: [memory-systems-engineer, mcp-protocol-engineer]
produces: {}
pair: [docs/specs/plugins/$1.md]
last_implemented: null
code_paths: []
```

Body: full brief skeleton (all section headers, bodies empty).

## Step 5 — Write the spec

Write `docs/specs/plugins/$1.md` with frontmatter:

```yaml
title: $1 Plugin Spec
slug: $1
audience: [agents]
owner: memory-systems-engineer
status: draft
created: <today>
updated: <today>
source: authored
pair: [docs/briefs/$2/$1.md]
```

Body: full engineer spec skeleton from `templates/spec.md`.

## Step 6 — Print confirmation

```
Created (brief):  docs/briefs/$2/$1.md
Created (spec):   docs/specs/plugins/$1.md
Pair link:        bidirectional via pair: frontmatter
Next steps:
  1. Advisor: complete the brief, then set status: ready
  2. Engineer: read brief + spec, implement, check off Handoff checklist
  3. Run /handoff docs/briefs/$2/$1.md to get engineer-actionable summary
```

## Reference

- `.claude/skills/domain-brief/templates/brief.md` — brief skeleton
- `.claude/skills/new-plugin/templates/spec.md` — engineer spec skeleton
- Plan §7 — advisor → engineer handoff flow
- Plan §6 — frontmatter convention
