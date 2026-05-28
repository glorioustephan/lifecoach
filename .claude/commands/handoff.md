---
description: |
  Read a domain brief and restate its spec in engineer-actionable terms. Parses
  consumers: and pair: frontmatter to identify the right technical agents to invoke,
  and suggests verification commands. Use after a brief's status is set to ready.
allowed-tools: Read Grep
argument-hint: [brief-path]
---

# Handoff — /handoff

Brief: **$1**

## Step 1 — Read the brief

Read the file at `$1`. If it does not exist, stop:

```
Error: Brief not found at $1
Run /brief-status to see available briefs and their paths.
```

Extract from frontmatter:
- `title`, `slug`, `status`, `owner`, `consumers`, `pair`, `produces`, `last_implemented`

## Step 2 — Status gate

If `status` is not `ready`, warn:

```
Warning: This brief has status "$status" — not yet "ready".
Briefs should be marked status: ready before handoff.
Current status means: <explain what draft/in-progress/needs-input/done/superseded means>
Proceeding with handoff summary anyway.
```

## Step 3 — Read paired spec (if exists)

If `pair:` is non-empty, read each file listed. The spec is the **normative** contract;
the brief is aspirational. Note if a spec exists and summarize its key constraints.

## Step 4 — Emit engineer-actionable handoff

Print the following structured handoff document:

```markdown
## Handoff: <title>

**Brief:** $1
**Paired spec:** <spec-path or "none — brief is the primary contract">
**Status:** <status>
**Owner (advisor):** <owner>

### What this is asking for

<2-4 sentences restating the problem and recommendation from the brief in plain
engineering terms. No jargon from the advisor domain — phrase it as a task.>

### Data / schema work needed

<Summarize the "Data shapes (informal)" section as concrete implementation tasks.
If a spec exists, defer to the spec's "Storage tables" and "Inputs" sections.>

### MCP / tool work needed

<Summarize any tools to expose, referencing the spec's "Tool name" if present.>

### Which agent(s) to invoke

<List each consumer from frontmatter with a one-line rationale and the exact
invocation suggestion, e.g.:>

- **memory-systems-engineer** — implement schema + migration
  → Invoke for: packages/core/src/memory/** changes, SQL migrations
  → Start: read the paired spec, then run /new-migration <verb>_<noun>

- **mcp-protocol-engineer** — expose MCP tool
  → Invoke for: packages/mcp-server/** tool registration
  → Start: read docs/specs/mcp-tools/<name>.md (or run /mcp-tool-spec <name>)

### Verification commands

<List the pnpm commands an engineer should run to confirm their work:>

- `pnpm -r typecheck`
- `pnpm --filter @lifecoach/core test`
- *(add spec-specific verification from spec's "Tests" section if present)*

### Handoff checklist (from brief)

<Reproduce the brief's ## Handoff checklist section verbatim, or note "none specified".>

### Next status transition

After pickup: flip `status: in-progress` in the brief.
After completion: flip `status: done`, set `last_implemented: <date>`, check off items.
If blocked: flip `status: needs-input`, append `## Open questions for <owner>`.
```

## Reference

- `docs/briefs/` — all domain briefs
- `docs/specs/` — paired engineer specs
- Plan §7 — advisor → engineer handoff flow
