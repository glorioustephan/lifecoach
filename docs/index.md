---
title: lifecoach Documentation Index
slug: docs-index
audience: [agents, humans]
owner: technical-writer
status: ready
created: 2026-05-25
updated: 2026-05-25
source: authored
---

# lifecoach docs

A dual-audience corpus. Every page declares `audience:` in frontmatter so agents and humans alike know who it's for. Authored content lives where humans put it; generated reference content lives under `reference/` with a generator banner — re-run via the named skill, never hand-edit.

## Section map

| Section | Audience | Owner agent | Source | Freshness policy |
|---|---|---|---|---|
| `index.md` (this file) | both | `technical-writer` | authored | Updated whenever a section is added or owner changes |
| `architecture/` | both | `technical-writer` | authored | Reviewed when topology or runtime invariants change |
| `reference/schema.md` | agents | `technical-writer` | generated | Regenerated after every migration |
| `reference/migrations.md` | both | `memory-systems-engineer` | append-only | Bumped on every new migration |
| `reference/mcp-tools.md` | agents | `technical-writer` | generated | Regenerated when MCP tool surface changes |
| `reference/plugins.md` | agents | `technical-writer` | generated | Regenerated when artifact plugin registry changes |
| `reference/env-vars.md` | both | `technical-writer` | generated | Regenerated from `env.example` |
| `specs/plugins/` | engineers | `mcp-protocol-engineer` | authored | Bound contract; updated before code changes shape |
| `specs/mcp-tools/` | engineers | `mcp-protocol-engineer` | authored | Bound contract |
| `specs/connectors/` | engineers | `integrations-engineer` | authored | Bound contract |
| `specs/migrations/` | engineers | `memory-systems-engineer` | authored | Bound contract |
| `briefs/finance/` | both | `financial-advisor` | authored | Lifecycle: draft → ready → in-progress → done |
| `briefs/productivity/` | both | `productivity-coach-advisor` | authored | Same lifecycle |
| `briefs/wellness/` | both | `holistic-wellness-advisor` | authored | Same lifecycle |
| `taxonomies/` | both | domain advisors | authored | Versioned controlled vocab |
| `evals/` | both | domain + technical | authored rubrics, generated results | Results regenerated on demand |
| `prompts/` | runtime + humans | domain advisors | authored | Updated when coaching content evolves |
| `ui-design-system.md`, `visual-design.md`, `prompt-kit-parity.md`, `ux-spec.md`, `ui-layout-audit.md` | both | `ui-engineer` + `technical-writer` | authored | Existing — migrated incrementally |
| `architecture-brief-for-handoff.md` | both | `technical-writer` | authored | Existing — folding into `architecture/overview.md` |
| `deployment.md`, `pm2-setup.md` | humans | ops + `technical-writer` | authored | Existing — folding into `architecture/runtime-topology.md` |

## Reading order for a new contributor

1. Root `README.md` — what lifecoach is.
2. `AGENTS.md` (root) — cross-tool conventions + package map.
3. `CLAUDE.md` (root) — the agent council and how dev work is delegated.
4. `architecture-brief-for-handoff.md` — system-design narrative.
5. `ui-design-system.md` + `visual-design.md` — UI rules (if touching web).
6. `briefs/<domain>/` for the area you're working on — current thinking from the advisor.
7. `specs/<kind>/<name>.md` if a paired spec exists — that's the binding contract.

## How the corpus stays alive

- **Domain advisors** publish briefs under `briefs/<domain>/`. Each brief lists `consumers:` (technical agents) and `produces:` (concrete artifacts).
- **Technical engineers** grep for `consumers:<their-name>` + `status: ready` to find work; if a paired `specs/...` exists, that's the normative contract.
- **`post-edit-domain-sync.sh`** hook nudges engineers when they edit code referenced by a brief's `code_paths:`.
- **`post-edit-schema.sh`** hook reminds them to regenerate `reference/schema.md` and `reference/migrations.md`.
- **`technical-writer`** owns regeneration cadence and the `doc-refresh` skill audits drift.
- **`/brief-status [domain?]`** prints what's open, ready, or stuck.
