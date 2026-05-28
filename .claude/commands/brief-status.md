---
description: |
  Show a status table of all domain advisory briefs grouped by status. Optionally
  filter by domain (finance, productivity, wellness). Use to get a quick overview
  of what is draft, ready for engineer pickup, in-progress, done, or superseded.
allowed-tools: Read Glob Grep Bash(ls *)
argument-hint: [domain?]
---

# Brief Status — /brief-status

Domain filter: **$ARGUMENTS** (blank = all domains)

## Step 1 — Discover briefs

If `$ARGUMENTS` is provided and is a valid domain (`finance`, `productivity`, `wellness`):
- Glob `docs/briefs/$ARGUMENTS/**/*.md`

Otherwise (blank or unrecognized):
- Glob `docs/briefs/**/*.md`

If no files are found:
```
No briefs found under docs/briefs/<filter>.
Run /domain-brief or /new-plugin to create the first brief.
```

## Step 2 — Parse frontmatter per brief

For each file, extract:
- `title` (or use filename slug if missing)
- `owner`
- `consumers` (list → join with `, `)
- `status`
- `created`
- `updated`
- `pair` (non-empty = has paired spec)

Compute age: days since `updated:` (or `created:` if `updated:` missing).

## Step 3 — Group by status

Group all briefs into buckets:

| Status | Meaning |
|--------|---------|
| `draft` | Advisor is still filling in sections |
| `ready` | Brief complete; awaiting engineer pickup |
| `needs-input` | Engineer blocked; waiting for advisor response |
| `in-progress` | Engineer has picked up; implementation underway |
| `done` | Fully implemented and verified |
| `superseded` | Replaced by a newer brief; kept for history |

## Step 4 — Emit status table

Print one table per status group (only print groups that have at least one entry):

```markdown
## Brief Status Report — <domain filter or "all"> — <today>

### Ready for pickup (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|
| Tax Lots Plugin | financial-advisor | memory-systems-engineer, mcp-protocol-engineer | yes | 5d | docs/briefs/finance/tax-lots.md |

### In progress (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|

### Needs input (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|

### Draft (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|

### Done (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|

### Superseded (N)

| Brief | Owner | Consumers | Paired spec | Age | Path |
|-------|-------|-----------|-------------|-----|------|

---
**Total:** N briefs across M domains
**Action needed:** N ready (engineer pickup), N needs-input (advisor response)
```

## Reference

- `docs/briefs/` — all domain briefs
- Plan §6 — frontmatter convention and status lifecycle
- `/handoff` — get engineer-actionable summary for a ready brief
- `/council` — fan out a new topic to all three advisors
