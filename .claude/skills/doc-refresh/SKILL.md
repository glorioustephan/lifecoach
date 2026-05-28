---
description: |
  Audit docs/ for stale pages by comparing each file's updated: frontmatter against
  the last git commit date of its referenced code_paths. Use when asked to find
  out-of-date documentation, check doc freshness, or produce a list of docs that
  need review. Emits a markdown staleness table — no file writes.
allowed-tools: Read Glob Grep Bash(git log *)
argument-hint: [scope?]
---

# Doc Refresh — /doc-refresh

Freshness audit for **$ARGUMENTS** (default: all of `docs/`).

This skill is read-only. It produces a staleness report as output — it does not
write or modify any files.

## Step 1 — Discover docs

If `$ARGUMENTS` is provided, glob `docs/$ARGUMENTS/**/*.md`. Otherwise glob `docs/**/*.md`.

Exclude:
- `docs/evals/results/**` (generated; has its own cadence)
- Files with `source: generated` frontmatter (those are owned by their generator)

## Step 2 — Parse frontmatter per file

For each discovered file, read and extract:
- `updated:` — the last-updated date declared in frontmatter (ISO date string)
- `owner:` — the agent responsible
- `code_paths:` — optional list of code glob patterns this doc tracks
- `status:` — current status
- `title:` — display name

If `updated:` is missing, treat as stale (date = "unknown").

## Step 3 — Compare against git log

For each file that has `code_paths:` entries, run:

```bash
git log -1 --format=%ai -- <code_path_glob>
```

(Run once per code_path entry; take the most recent date across all globs.)

If any code_path's latest commit is **newer** than the file's `updated:` date by more
than 7 days, mark the file as **stale**.

Files with no `code_paths:` are evaluated on `updated:` age alone:
- > 90 days since `updated:` with `status` not `superseded` → mark as **aging**
- > 180 days → mark as **stale**

## Step 4 — Emit staleness table

Print the report as a markdown table sorted by staleness severity (stale first):

```markdown
## Doc Freshness Report — <scope> — <today>

| File | Status | Owner | Doc updated | Code last commit | Drift | Suggested action |
|------|--------|-------|-------------|-----------------|-------|-----------------|
| docs/briefs/finance/monarch-ingest.md | stale | financial-advisor | 2026-03-01 | 2026-05-10 | 70 days | Ask financial-advisor to review and bump updated: |
| docs/reference/schema.md | aging | technical-writer | 2026-02-15 | — | 99 days | Re-run /technical-writer regen |
| ... | | | | | | |

**Summary:** N stale, M aging, K current (out of T docs scanned)
```

If all docs are current, print:
```
All docs are current. No stale pages found in <scope>.
```

## Step 5 — Suggest owners

For each stale file, suggest the most appropriate action:
- `source: authored` + `owner:` set → mention the owner agent by name
- `source: generated` → suggest re-running the generator skill
- No `code_paths:` and old `updated:` → flag for `technical-writer` to assess

## Reference

- `docs/**` — the corpus being audited
- `.claude/rules/docs.md` — frontmatter spec and freshness expectations
- Plan §6 — `updated:` and `code_paths:` frontmatter convention
