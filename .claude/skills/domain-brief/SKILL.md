---
description: |
  Create a new domain advisory brief under docs/briefs/. Use when a domain advisor
  (financial-advisor, productivity-coach-advisor, holistic-wellness-advisor) needs to
  produce a structured brief for a plugin, taxonomy, rubric, or prompt spec. Validates
  domain, stamps frontmatter, and writes the full brief skeleton ready for the advisor
  to fill in.
allowed-tools: Read Write Glob
argument-hint: [domain] [slug] [one-line summary]
---

# Domain Brief — /domain-brief

Create a new advisory brief for domain **$1**, slug **$2**: _$3_

## Step 1 — Validate domain

`$1` must be one of: `finance`, `productivity`, `wellness`.

If it is not, stop and print:

```
Error: domain "$1" is not valid. Choose from: finance, productivity, wellness.
```

## Step 2 — Check for collisions

Glob `docs/briefs/$1/$2.md`. If the file already exists, stop and print:

```
Error: docs/briefs/$1/$2.md already exists. Choose a different slug or edit the existing brief.
```

## Step 3 — Resolve owner

Map domain to owner agent:

| Domain | Owner |
|--------|-------|
| `finance` | `financial-advisor` |
| `productivity` | `productivity-coach-advisor` |
| `wellness` | `holistic-wellness-advisor` |

## Step 4 — Read template

Read `.claude/skills/domain-brief/templates/brief.md` to get the skeleton.

## Step 5 — Write brief

Write `docs/briefs/$1/$2.md` with:

- Frontmatter: `title` from "$3", `slug: $2`, `audience: [agents, humans]`, `owner` per step 3,
  `status: draft`, `created: <today>`, `updated: <today>`, `source: authored`,
  `consumers: []` (advisor fills in after drafting), `produces: {}`, `pair: []`,
  `last_implemented: null`, `code_paths: []`
- Body: full brief skeleton from the template (all section headers present, bodies empty for advisor to fill)

## Step 6 — Print confirmation

Print the absolute path of the created file:

```
Created: /absolute/path/to/docs/briefs/$1/$2.md
Owner: <owner>
Status: draft
Next: open the brief and complete all sections, then set status: ready to trigger engineer pickup.
```

## Reference

- `.claude/skills/domain-brief/templates/brief.md` — full brief skeleton
- `docs/briefs/` — existing briefs to check slug uniqueness
- Plan §6 — frontmatter convention
- Plan §7 — advisor → engineer handoff flow
