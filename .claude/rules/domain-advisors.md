---
paths:
  - "docs/briefs/**"
  - "docs/taxonomies/**"
  - "docs/evals/**"
---

# Domain Advisor Rules

Rules for all three domain advisory agents (financial-advisor, productivity-coach-advisor, holistic-wellness-advisor) and for any content they author under the paths above.

## Brief frontmatter spec

Every file authored by a domain advisor must open with valid YAML frontmatter containing at minimum:

```yaml
---
title: <Human-readable title>
slug: <kebab-slug matching filename>
audience: [agents, humans]
owner: <financial-advisor|productivity-coach-advisor|holistic-wellness-advisor>
status: draft|ready|in-progress|done|superseded
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
source: authored
code_paths: []          # advisors fill this if they know target packages
consumers: []           # list of technical agent names who will implement
produces: {}            # optional: schema/tool outputs the brief drives
pair: []                # optional: linked docs/specs/<kind>/<slug>.md
last_implemented: null  # updated by the implementing engineer
---
```

Required fields: `title`, `slug`, `audience`, `owner`, `status`, `created`, `updated`, `source`.

## Output contract

Each brief must contain the following top-level sections in order:

1. `## Problem` — what user need or system gap this addresses.
2. `## Recommendation` — the advisor's concrete recommendation (data shapes, prompt content, rubric).
3. `## Data shapes (informal)` — informal field-level sketch; NOT TypeScript; NOT SQL. Plain prose or bullet lists.
4. `## Prompts / Rubrics` — any prompt text, scoring rubrics, or classification criteria.
5. `## Evaluation criteria` — how an engineer or eval agent can confirm the implementation is correct.
6. `## Risks & open questions` — known gaps, privacy concerns, data quality questions.
7. `## Handoff checklist` — GitHub-style checkboxes per consuming technical agent.

## Advisor–engineer handoff protocol

1. Advisor sets `status: ready` when the brief is complete enough for implementation.
2. The consuming engineer greps `docs/briefs/**` for their name in `consumers:` with `status: ready`.
3. If a paired `docs/specs/...` file exists, that spec is the **normative contract**; the brief is aspirational context.
4. Engineer implements, checks off handoff items, and bumps `status` to `in-progress` then `done`.
5. Engineer updates `last_implemented:` with the date of the final commit.
6. For open questions, engineer appends `## Open questions for <advisor>` and sets `status: needs-input`; advisor responds and resets to `ready`.

## Forbidden actions for domain advisors

Domain advisors operate under strict separation of concerns:

- **No code edits.** Advisors must not write or edit any file outside of `docs/`. They have no `Edit` tool and must not attempt workarounds.
- **No runtime invocation.** Advisors are dev-time-only. They must never be spawned as part of an app request, cron job, or MCP tool call.
- **No MCP tool calls.** Advisors must not call any MCP server tool. Their output is documents, not API side effects.
- **No schema or migration authoring.** Advisors sketch data shapes in prose; engineers translate to SQL/TypeScript.
- **No changes to `packages/`.** Any file under `packages/` is out of bounds regardless of content.

Violation of these rules is a task failure. The advisor must stop and surface the constraint to the user.
