---
title: Database Schema Reference
slug: schema
audience: [agents, humans]
owner: memory-systems-engineer
status: ready
created: 2026-05-28
updated: 2026-05-29
source: authored
code_paths:
  - packages/core/src/storage/migrations/**
  - packages/schemas/src/**
  - packages/core/src/storage/repositories/**
---

# Database Schema Reference

> Last refreshed: 2026-05-28 (Wave 5g closeout)

SQLite schema for lifecoach. All timestamps are Unix milliseconds unless noted. Managed via sequential migration files in `packages/core/src/storage/migrations/`. Apply order is lexicographic filename sort; each applied file is recorded in `_migrations` and skipped on re-open (idempotent).

SQLite pragmas set at open time: `WAL` journal mode, `foreign_keys = ON`, `synchronous = NORMAL`, 32 MB page cache, `temp_store = MEMORY`.

---

## Bookkeeping table

### `_migrations`

Internal migration tracker created by `runMigrations()` in `packages/core/src/storage/db.ts`. Not a user-facing table.

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT PK | Migration filename (e.g. `001_init.sql`). |
| `applied_at` | INTEGER | Unix ms timestamp when the migration was applied. |

`014a_repair_renamed_migrations.sql` rewrites three rows in this table to rename old sequential filenames (`015/016/017`) to the current timestamp-prefixed names. It is the only migration that writes to `_migrations` directly; all others only insert a new row after their own SQL runs.

---

## Core tables

### `profile`

Key/value store for user profile data. Values are JSON-encoded.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT | JSON-encoded. |
| `updated_at` | INTEGER | |

### `sessions`

Conversation session records.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `started_at` | INTEGER | |
| `ended_at` | INTEGER | Nullable. |
| `summary` | TEXT | Nullable. |
| `archived_at` | INTEGER | Nullable. Added migration `008_sessions_archive.sql`. |
| `sdk_session_id` | TEXT | Nullable. Added migration `010_sessions_sdk_id.sql`. The Claude Agent SDK's internal session ID; passed as `options.resume` to restore multi-turn coherence across HTTP requests. |

**Indexes:**
- `idx_sessions_started_at` on `(started_at DESC)`
- `idx_sessions_archived_at` on `(archived_at)`

### `messages`

Individual turns within a session.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `session_id` | TEXT | FK → `sessions(id) ON DELETE CASCADE`. |
| `role` | TEXT | `user` \| `assistant` \| `tool`. |
| `content` | TEXT | |
| `tool_use` | TEXT | Nullable. JSON-encoded tool call data. |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_messages_session_time` on `(session_id, created_at)`
- `idx_messages_created_at` on `(created_at DESC)`

### `facts`

Semantic memory: user profile facts, preferences, observations. Soft-deleted via `valid_to`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `category` | TEXT | |
| `subject` | TEXT | |
| `body` | TEXT | |
| `data` | TEXT | Nullable. JSON-encoded. |
| `source` | TEXT | Nullable. |
| `confidence` | REAL | Default `1.0`. |
| `valid_from` | INTEGER | Nullable. |
| `valid_to` | INTEGER | Nullable. `NULL` = currently active; set to a timestamp to soft-delete. |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_facts_category` on `(category)`
- `idx_facts_subject` on `(subject)`
- `idx_facts_valid_to` on `(valid_to)`
- `idx_facts_active_created` (partial) on `(created_at DESC) WHERE valid_to IS NULL` — added migration `1779989084`. Hot-path filter for active facts sorted by recency.

### `documents`

Ingested documents (markdown, PDFs, CSVs) and externally-synced objects (Capacities).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `source` | TEXT | Origin path or URL. |
| `mime` | TEXT | Nullable. |
| `title` | TEXT | Nullable. |
| `body` | TEXT | |
| `metadata` | TEXT | Nullable. JSON-encoded. |
| `ingested_at` | INTEGER | |
| `external_id` | TEXT | Nullable. Added migration `006_documents_external_ref.sql`. |
| `external_source` | TEXT | Nullable. Added migration `006_documents_external_ref.sql`. `'capacities'` for Capacities-synced objects. |

**Indexes:**
- `idx_documents_source` on `(source)`
- `idx_documents_ingested_at` on `(ingested_at DESC)`
- `idx_documents_external` (UNIQUE partial) on `(external_source, external_id) WHERE external_id IS NOT NULL`
- `idx_documents_external_source` (partial) on `(external_source) WHERE external_source IS NOT NULL`

### `ingested_files`

Tracks files already ingested, keyed by content hash for idempotent re-ingest. Moving or renaming the same file without changing its content is a no-op.

| Column | Type | Notes |
|---|---|---|
| `hash` | TEXT PK | Content hash. |
| `path` | TEXT | File path at ingest time. |
| `document_id` | TEXT | FK → `documents(id) ON DELETE CASCADE`. |
| `size_bytes` | INTEGER | |
| `ingested_at` | INTEGER | |

**Indexes:**
- `idx_ingested_files_path` on `(path)`
- `idx_ingested_files_doc` on `(document_id)`

### `measurements`

Time-series numeric observations: weight, HRV, net worth, monthly burn, savings rate, etc. `metric` + `recorded_at` form the natural key (not enforced as UNIQUE at the DB level).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `metric` | TEXT | Snake-case name (e.g. `weight_kg`, `savings_rate_mtd`). |
| `value` | REAL | |
| `unit` | TEXT | Nullable. |
| `recorded_at` | INTEGER | |
| `source_document_id` | TEXT | Nullable. FK → `documents(id) ON DELETE SET NULL`. |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_measurements_metric_time` on `(metric, recorded_at)`

### `reflections`

Structured reflections generated by the Reflector. Body is Markdown; structured fields are JSON arrays.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `period_start` | INTEGER | |
| `period_end` | INTEGER | |
| `kind` | TEXT | Reflection type (e.g. `weekly`, `monthly`). |
| `body` | TEXT | Markdown prose. |
| `created_at` | INTEGER | |
| `title` | TEXT | Nullable. Added migration `009_engine_enhancements.sql`. |
| `themes` | TEXT | JSON array. Default `'[]'`. Added migration `009_engine_enhancements.sql`. |
| `wins` | TEXT | JSON array. Default `'[]'`. Added migration `009_engine_enhancements.sql`. |
| `concerns` | TEXT | JSON array. Default `'[]'`. Added migration `009_engine_enhancements.sql`. |
| `open_threads` | TEXT | JSON array. Default `'[]'`. Added migration `009_engine_enhancements.sql`. |
| `pushed_to_capacities_at` | INTEGER | Nullable. Added migration `011_reflections_capacities_push.sql`. Records when this reflection was pushed to a Capacities daily note; prevents duplicate appends on repeated cron runs. |

**Indexes:**
- `idx_reflections_kind_time` on `(kind, period_end DESC)`
- `idx_reflections_created_at` on `(created_at DESC)` — added migration `009_engine_enhancements.sql`
- `idx_reflections_kind_period` on `(kind, period_start, period_end)` — added migration `011_reflections_capacities_push.sql`. Supports fast dedup during re-runs over the same window.

### `insights`

Inbox-style insights surfaced to the user. Not to be confused with `financial_insights`, which is a separate table with its own priority and category model.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `topic` | TEXT | |
| `body` | TEXT | |
| `rationale` | TEXT | Nullable. |
| `source_fact_ids` | TEXT | JSON array. Default `'[]'`. |
| `created_at` | INTEGER | |
| `acted_on_at` | INTEGER | Nullable. |
| `dismissed_at` | INTEGER | Nullable. |
| `snoozed_until` | INTEGER | Nullable. Added migration `004_insights_extras.sql`. Hidden until this timestamp passes. |
| `priority` | INTEGER | Default `1`. Added migration `004_insights_extras.sql`. 1 = normal, 2 = worth noticing, 3 = needs attention. |
| `evidence_refs` | TEXT | JSON array. Default `'[]'`. Added migration `009_engine_enhancements.sql`. |
| `acted_entity_type` | TEXT | Nullable. Added migration `1780051448_add_insight_acted_entity.sql`. `'goal' \| 'task' \| 'habit'` — what was created when acting on the card via the create-from-card flow. |
| `acted_entity_id` | TEXT | Nullable. Added migration `1780051448_add_insight_acted_entity.sql`. FK-by-convention to the created entity. Both columns NULL for insights acted without a concrete entity, or dismissed. |

**Indexes:**
- `idx_insights_topic` on `(topic)`
- `idx_insights_created_at` on `(created_at DESC)`
- `idx_insights_state` on `(acted_on_at, dismissed_at, snoozed_until)` — added migration `004_insights_extras.sql`
- `idx_insights_priority` on `(priority DESC)` — added migration `004_insights_extras.sql`

### `attention_signals`

Deduplicated, stateful alerts surfaced to the user outside the insight inbox. Keyed by `dedup_key` so repeated detection of the same condition merges into one row rather than creating duplicates.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `kind` | TEXT | Signal type. |
| `title` | TEXT | |
| `body` | TEXT | |
| `priority` | INTEGER | Default `1`. |
| `evidence_refs` | TEXT | JSON array. Default `'[]'`. |
| `dedup_key` | TEXT | UNIQUE. Prevents duplicate rows for the same recurring condition. |
| `state` | TEXT | Default `'active'`. |
| `first_seen_at` | INTEGER | |
| `last_seen_at` | INTEGER | |
| `acted_on_at` | INTEGER | Nullable. |
| `dismissed_at` | INTEGER | Nullable. |

**Indexes:**
- `idx_attention_signals_state` on `(state, priority DESC, last_seen_at DESC)`
- `idx_attention_signals_kind` on `(kind, last_seen_at DESC)`

### `job_runs`

Records of background job executions (cron, manual triggers). Used for observability and audit.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | Job name. |
| `status` | TEXT | |
| `started_at` | INTEGER | |
| `finished_at` | INTEGER | Nullable. |
| `duration_ms` | INTEGER | Nullable. |
| `error_summary` | TEXT | Nullable. |
| `generated_refs` | TEXT | JSON array. Default `'[]'`. |

**Indexes:**
- `idx_job_runs_name_started` on `(name, started_at DESC)`
- `idx_job_runs_status` on `(status, started_at DESC)`

### `job_locks`

Cooperative lock table. One row per running job; the row is deleted (or cascades) when the job completes.

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT PK | Job name. |
| `run_id` | TEXT | FK → `job_runs(id) ON DELETE CASCADE`. |
| `locked_at` | INTEGER | |

### `meta`

Lightweight key/value store for schema metadata.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT | |

Known keys: `embedding_dim` (set at startup to `LIFECOACH_EMBEDDING_DIM`, default `1024`), `schema_version`.

---

## sqlite-vec tables

### `embeddings` (virtual, sqlite-vec)

`vec0` virtual table storing `FLOAT[N]` embedding vectors. Dimension N comes from `LIFECOACH_EMBEDDING_DIM` env var (default `1024`). Created at runtime by `openDb()` before migrations run — not in a SQL migration file — so purge scripts that reference it (e.g. `1779976662_purge_finance_narrative_embeddings.sql`) work on a fresh DB.

A dimension mismatch between the stored `meta.embedding_dim` and the configured dim causes a hard startup error (`EMBED_DIM_MISMATCH`). Never change dim without rebuilding all vec data.

### `embedding_refs`

Maps `embeddings` rowids to the entity each vector describes.

| Column | Type | Notes |
|---|---|---|
| `embedding_rowid` | INTEGER PK | Matches the `rowid` in the `embeddings` virtual table. |
| `ref_type` | TEXT | Entity type. See values below. |
| `ref_id` | TEXT | ID of the originating entity. |
| `chunk_index` | INTEGER | Default `0`. Position in multi-chunk sources. |
| `text` | TEXT | The text that was embedded. |
| `created_at` | INTEGER | |
| `model` | TEXT | Nullable. Voyage model name (e.g. `voyage-3-large`). Added migration `009_engine_enhancements.sql`. |
| `dimension` | INTEGER | Nullable. Dimension at embed time. Added migration `009_engine_enhancements.sql`. |
| `text_hash` | TEXT | Nullable. Hash of `text`; enables targeted re-embed when content changes. Added migration `009_engine_enhancements.sql`. |
| `embedded_at` | INTEGER | Nullable. Backfilled from `created_at` on migration. Added migration `009_engine_enhancements.sql`. |
| `source_updated_at` | INTEGER | Nullable. Last-modified timestamp of the source entity at embed time. Added migration `009_engine_enhancements.sql`. |

**Indexes:**
- `idx_embedding_refs_target` on `(ref_type, ref_id)`
- `idx_embedding_refs_hash` on `(text_hash)` — added migration `009_engine_enhancements.sql`
- `idx_embedding_refs_embedded_at` on `(embedded_at DESC)` — added migration `009_engine_enhancements.sql`

**`ref_type` values:** `fact`, `document`, `message`, `reflection`, `task`, `finance`, `goal`, `milestone`.

---

## Task and artifact tables

### `tasks`

Tasks mirrored from external systems (primarily Todoist). Locally-created tasks leave `external_id` / `external_source` NULL.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `external_id` | TEXT | Nullable. |
| `external_source` | TEXT | Nullable. |
| `content` | TEXT | Task title/body. |
| `description` | TEXT | Nullable. |
| `project_id` | TEXT | Nullable. |
| `project_name` | TEXT | Nullable. |
| `labels` | TEXT | JSON array. Default `'[]'`. |
| `priority` | INTEGER | Nullable. |
| `due_at` | INTEGER | Nullable. |
| `due_string` | TEXT | Nullable. |
| `completed_at` | INTEGER | Nullable. |
| `url` | TEXT | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |
| `synced_at` | INTEGER | |
| `goal_id` | TEXT | Nullable. FK → `goals(id) ON DELETE SET NULL`. Added migration `1779943873_add_tasks_goal_link.sql`. |
| `milestone_id` | TEXT | Nullable. FK → `milestones(id) ON DELETE SET NULL`. Added migration `1779943873_add_tasks_goal_link.sql`. |

**Indexes:**
- `idx_tasks_external` (UNIQUE partial) on `(external_source, external_id) WHERE external_id IS NOT NULL`
- `idx_tasks_due` on `(due_at)`
- `idx_tasks_completed` on `(completed_at)`
- `idx_tasks_project` on `(project_id)`
- `idx_tasks_goal` on `(goal_id)` — added migration `1779943873`
- `idx_tasks_milestone` on `(milestone_id)` — added migration `1779943873`

### `artifacts`

Reusable, standardized-Markdown objects (recipes, frameworks, etc.) extracted from conversations or ingested documents.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `type` | TEXT | Plugin ID (e.g. `recipe`). |
| `title` | TEXT | |
| `body` | TEXT | Standardized Markdown. |
| `category` | TEXT | Nullable. |
| `tags` | TEXT | JSON array. Default `'[]'`. |
| `confidence` | REAL | Nullable. 0–1 for LLM-extracted artifacts; NULL for manual. |
| `origin` | TEXT | `conversation` \| `cron` \| `manual`. |
| `source_session_id` | TEXT | Nullable. |
| `source_message_ids` | TEXT | JSON array. Default `'[]'`. |
| `dedup_key` | TEXT | Nullable. Type + normalized title; guards against cron re-surfacing the same artifact. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |
| `source_document_id` | TEXT | Nullable. Added migration `012_artifacts_source_document.sql`. FK to `documents` when the artifact came from an ingested file rather than a conversation. |

**Indexes:**
- `idx_artifacts_type` on `(type)`
- `idx_artifacts_created_at` on `(created_at DESC)`
- `idx_artifacts_dedup` on `(dedup_key)`
- `idx_artifacts_source_document` on `(source_document_id)` — added migration `012_artifacts_source_document.sql`

---

## Goal and project tables

### `projects`

Project containers bundling goals, tasks, documents, and measurements under a shared scope.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT | |
| `body` | TEXT | Nullable. |
| `status` | TEXT | Default `'active'`. Values: `active \| paused \| done \| abandoned`. |
| `target_date` | INTEGER | Nullable. |
| `started_at` | INTEGER | |
| `ended_at` | INTEGER | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_projects_status` on `(status)`
- `idx_projects_started` on `(started_at DESC)`

### `goals`

First-class goal entities. Goals may be nested via `parent_goal_id`. WOOP fields and goal-kind columns added in migration `1779943871`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT | |
| `body` | TEXT | Nullable. |
| `horizon` | TEXT | Default `'open'`. Values: `this-week \| this-month \| this-quarter \| this-year \| open`. |
| `status` | TEXT | Default `'active'`. Values: `active \| paused \| done \| abandoned`. |
| `success_criteria` | TEXT | Nullable. |
| `parent_goal_id` | TEXT | Nullable. FK → `goals(id) ON DELETE SET NULL`. |
| `project_id` | TEXT | Nullable. FK → `projects(id) ON DELETE SET NULL`. |
| `target_metric` | TEXT | Nullable. Snake-case metric name for measurable goals. |
| `target_value` | REAL | Nullable. |
| `current_progress` | REAL | Nullable. |
| `due_at` | INTEGER | Nullable. |
| `completed_at` | INTEGER | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |
| `kind` | TEXT | Default `'outcome'`. Values: `outcome \| process \| identity`. Added migration `1779943871`. |
| `cadence` | TEXT | Nullable. `daily \| weekly \| monthly`. Meaningful only when `kind='process'`. Added migration `1779943871`. |
| `outcome` | TEXT | Nullable. WOOP outcome — felt picture of success. Added migration `1779943871`. |
| `obstacle` | TEXT | Nullable. WOOP obstacle — what gets in the way. Added migration `1779943871`. |
| `implementation_intention` | TEXT | Nullable. "After [anchor], I will [behavior] in [context]." Added migration `1779943871`. |
| `identity_statement` | TEXT | Nullable. "I am someone who…" — anchors identity-kind goals. Added migration `1779943871`. |
| `review_cadence` | TEXT | Default `'weekly'`. Values: `weekly \| monthly \| quarterly \| as-needed`. Added migration `1779943871`. |
| `last_reviewed_at` | INTEGER | Nullable. Updated on each review pass; "stalled" = `now - last_reviewed_at > review_cadence`. Added migration `1779943871`. |
| `archived_at` | INTEGER | Nullable. Soft archive — embeddings and context remain valid. Added migration `1779943871`. |

**Indexes:**
- `idx_goals_status` on `(status)`
- `idx_goals_horizon` on `(horizon)`
- `idx_goals_project` on `(project_id)`
- `idx_goals_due` on `(due_at)`
- `idx_goals_kind` on `(kind)` — added migration `1779943871`
- `idx_goals_last_reviewed` on `(last_reviewed_at)` — added migration `1779943871`
- `idx_goals_archived` on `(archived_at)` — added migration `1779943871`

### `milestones`

Ordered checkpoints within a goal. Semantically distinct from sub-goals (which use `goals.parent_goal_id`): milestones are lighter-weight, expected to complete in sequence, and do not carry `kind` / `horizon` / `cadence` themselves.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `goal_id` | TEXT | FK → `goals(id) ON DELETE CASCADE`. |
| `title` | TEXT | |
| `body` | TEXT | Nullable. |
| `status` | TEXT | Default `'pending'`. Values: `pending \| active \| done \| abandoned`. |
| `order_index` | INTEGER | Default `0`. Lower index surfaces first within a goal. |
| `due_at` | INTEGER | Nullable. |
| `completed_at` | INTEGER | Nullable. |
| `origin` | TEXT | Default `'manual'`. Values: `manual \| conversation \| cron`. |
| `confidence` | REAL | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_milestones_goal` on `(goal_id, order_index)`
- `idx_milestones_status` on `(status)`
- `idx_milestones_due` on `(due_at)`

### `goal_signals`

OKR-lite measurement signals for goal progress. Each goal may have several signals, either quantitative (tied to a `measurements.metric` and a `target_value`) or qualitative (observational descriptions).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `goal_id` | TEXT | FK → `goals(id) ON DELETE CASCADE`. |
| `label` | TEXT | Human-readable description of the signal. |
| `kind` | TEXT | Default `'qualitative'`. Values: `qualitative \| quantitative`. |
| `metric` | TEXT | Nullable. Snake-case metric name matching `measurements.metric`. Only for quantitative signals. |
| `target_value` | REAL | Nullable. |
| `current_value` | REAL | Nullable. |
| `unit` | TEXT | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_goal_signals_goal` on `(goal_id)`
- `idx_goal_signals_metric` on `(metric)`

### `goal_evidence`

Append-only feed of events bearing on a goal's progress. Sources: chat (agent `record_goal_evidence` tool), cron (weekly review), manual UI. Read by the Reflector and Insighter to detect progress, stalls, and obstacles.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `goal_id` | TEXT | FK → `goals(id) ON DELETE CASCADE`. |
| `milestone_id` | TEXT | Nullable. FK → `milestones(id) ON DELETE SET NULL`. |
| `signal_id` | TEXT | Nullable. FK → `goal_signals(id) ON DELETE SET NULL`. |
| `body` | TEXT | Free-text description of what happened. |
| `source_ref_type` | TEXT | Nullable. Origin entity type: `message \| task \| measurement \| reflection \| manual`. Not a hard FK — origins live in different tables. |
| `source_ref_id` | TEXT | Nullable. ID of the originating row. |
| `delta` | REAL | Nullable. Numeric delta toward a signal's `target_value` (positive or negative). |
| `recorded_at` | INTEGER | |
| `origin` | TEXT | Default `'manual'`. Values: `manual \| conversation \| cron`. |
| `confidence` | REAL | Nullable. |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_goal_evidence_goal_recorded` on `(goal_id, recorded_at DESC)`
- `idx_goal_evidence_milestone` on `(milestone_id)`
- `idx_goal_evidence_signal` on `(signal_id)`
- `idx_goal_evidence_origin_recorded` on `(origin, recorded_at DESC)`

---

## Habits tables

Habits were introduced in migration `1780019158_create_habits.sql` as part of Workstream A. Habits are first-class recurring-action entities, distinct from goals. They may stand alone or link up to a parent goal/milestone.

### `habits`

Recurring action entities. Status and cadence drive stall detection (`isHabitStalled` in `packages/core/src/util/habit-cadence.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `title` | TEXT | Required. |
| `cadence` | TEXT | `daily \| weekly \| monthly`. |
| `status` | TEXT | Default `'active'`. Values: `active \| paused \| archived`. |
| `parent_goal_id` | TEXT | Nullable. FK → `goals(id) ON DELETE SET NULL`. |
| `parent_milestone_id` | TEXT | Nullable. FK → `milestones(id) ON DELETE SET NULL`. Only valid when `parent_goal_id` is also set (CHECK constraint). |
| `notes` | TEXT | Nullable. Free-text context. |
| `last_completed_at` | INTEGER | Nullable. Epoch ms of most recent logged completion; stamped by `setLastCompleted()` after each `habit_completions` insert. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**CHECK constraint:** `parent_milestone_id IS NULL OR parent_goal_id IS NOT NULL` — prevents orphaned milestone links.

**Indexes:**
- `idx_habits_parent_goal_id` (partial) on `(parent_goal_id) WHERE parent_goal_id IS NOT NULL`
- `idx_habits_status` on `(status)`

### `habit_completions`

Append-only log of individual completions. Deleting a row undoes a logged completion (UI undo / History tab).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `habit_id` | TEXT | FK → `habits(id) ON DELETE CASCADE`. |
| `completed_at` | INTEGER | Epoch ms. Stored at local noon on the given date (avoids timezone edge cases). |
| `notes` | TEXT | Nullable. |
| `origin` | TEXT | `manual \| conversation \| cron`. |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_habit_completions_habit_id_date` on `(habit_id, completed_at DESC)` — composite covering the per-habit history and `countByDayForHabits` GROUP BY.

---

## Financial tables

Financial tables were introduced in migration `008_financial.sql`. All subsequent financial migrations extend these tables.

### `accounts`

Monarch-synced bank and investment accounts.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Internal UUID. |
| `external_id` | TEXT | UNIQUE. Monarch account ID. |
| `display_name` | TEXT | |
| `type` | TEXT | `checking \| savings \| credit_card \| investment \| debt \| other`. |
| `balance` | REAL | |
| `currency` | TEXT | Default `'USD'`. |
| `institution` | TEXT | Nullable. Bank or institution name. |
| `status` | TEXT | Default `'active'`. Values: `active \| inactive \| closed`. |
| `synced_at` | INTEGER | |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_accounts_external_id` — dropped by migration `1779989084` (duplicated the implicit UNIQUE-constraint index)
- `idx_accounts_type` on `(type)`
- `idx_accounts_status` on `(status)`
- `idx_accounts_synced_at` on `(synced_at DESC)`

The implicit UNIQUE index on `external_id` (from the `UNIQUE` constraint in the DDL) remains. The explicit `idx_accounts_external_id` was redundant and was dropped by the index hygiene migration.

### `transactions`

Monarch-synced transactions. The effective category for a row is computed at read time as: per-transaction override > merchant rule > raw `category` column. Never filter by raw `category` in direct SQL — use the repository's `queryTransactions`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `external_id` | TEXT | UNIQUE (added migration `1779980907`). Monarch transaction ID. |
| `account_id` | TEXT | FK → `accounts(id)`. |
| `date` | INTEGER | Unix timestamp. |
| `amount` | REAL | Negative = expense, positive = income (Monarch convention). |
| `currency` | TEXT | Default `'USD'`. |
| `merchant` | TEXT | |
| `category` | TEXT | Nullable. Monarch's raw category. |
| `description` | TEXT | Nullable. |
| `is_pending` | INTEGER | Default `0`. Boolean (0/1). |
| `notes` | TEXT | Nullable. User-added annotations. |
| `synced_at` | INTEGER | |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |
| `is_recurring` | INTEGER | Default `0`. Boolean (0/1). Added migration `013_financial_recurring.sql`. |
| `recurring_frequency` | TEXT | Nullable. Monarch merchant stream frequency (e.g. `MONTHLY`). Added migration `013_financial_recurring.sql`. |
| `category_group_type` | TEXT | Nullable. Added migration `1779971644`. Monarch's category group: `income \| expense \| transfer`. `transfer` means cash movement between owned accounts — MUST be excluded from income/expense rollups. NULL on rows synced before this migration; the rollup falls back to name-based heuristics. |
| `is_transfer` | INTEGER | Nullable. Added migration `1779979153`. Monarch's own boolean transfer flag: `1` = transfer, `0` = not transfer, `NULL` = unknown (rows synced before the migration). This is tier-0 in `isTransferTxn()` and short-circuits all other heuristics. Stored as a tristate integer rather than boolean so pre-migration rows are distinguishable from explicitly flagged non-transfers. |

**Indexes:**
- `idx_transactions_account_id` on `(account_id)`
- `idx_transactions_date` on `(date DESC)`
- `idx_transactions_category` on `(category)`
- `idx_transactions_merchant` on `(merchant)`
- `idx_transactions_synced_at` on `(synced_at DESC)`
- `idx_transactions_external_id` (UNIQUE) — replaced the non-unique index, migration `1779980907`
- `idx_transactions_recurring` on `(is_recurring)` — added migration `013_financial_recurring.sql`
- `idx_transactions_category_group_type` on `(category_group_type)` — added migration `1779971644`
- `idx_transactions_date_transfer` on `(date DESC, is_transfer, category_group_type)` — added migration `1779989084`. Composite covering the rollup hot path: leading date column carries the range scan; transfer columns allow the planner to skip transfer rows at the index level.

### `holdings`

Point-in-time investment portfolio snapshots. One row per symbol per snapshot date per account.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `account_id` | TEXT | FK → `accounts(id)`. |
| `symbol` | TEXT | |
| `quantity` | REAL | |
| `current_price` | REAL | |
| `market_value` | REAL | |
| `cost_basis` | REAL | Nullable. |
| `asset_type` | TEXT | Default `'stock'`. Values: `stock \| fund \| etf \| crypto \| commodity \| other`. |
| `snapshot_date` | INTEGER | Unix timestamp of when this snapshot was taken. |
| `synced_at` | INTEGER | |
| `created_at` | INTEGER | |

**Indexes:**
- `idx_holdings_account_id` on `(account_id)`
- `idx_holdings_symbol` on `(symbol)`
- `idx_holdings_snapshot_date` on `(snapshot_date DESC)`

### `budgets`

Monthly budget limits by category. One row per `(category, month)` pair, enforced by a UNIQUE index.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `category` | TEXT | |
| `month` | TEXT | `YYYY-MM` format (validated at the schema layer). |
| `limit` | REAL | Quoted in SQL (`"limit"`) because `LIMIT` is a SQLite reserved keyword. |
| `spent` | REAL | Default `0`. |
| `status` | TEXT | Default `'active'`. Values: `active \| inactive \| archived`. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_budgets_category` on `(category)`
- `idx_budgets_month` on `(month DESC)`
- `idx_budgets_category_month` — dropped by migration `1779989084`
- `idx_budgets_category_month_unique` (UNIQUE) on `(category, month)` — added migration `1779989084`. Replaces the former non-unique index, closing a TOCTOU race in `upsertBudget`.

### `financial_insights`

Claude-synthesized financial insights, distinct from general `insights`. Carry a finance-specific `category` and `priority`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `topic` | TEXT | |
| `body` | TEXT | |
| `category` | TEXT | `spending \| debt \| investment \| cashflow`. |
| `priority` | INTEGER | Default `1`. 1 = normal, 2 = worth noticing, 3 = needs attention. |
| `recommendation` | TEXT | Nullable. |
| `source_data_ids` | TEXT | JSON array of contributing transaction/account IDs. |
| `dismissed_at` | INTEGER | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_financial_insights_category` on `(category)`
- `idx_financial_insights_priority` on `(priority DESC)`
- `idx_financial_insights_created_at` on `(created_at DESC)`
- `idx_financial_insights_dismissed_at` — dropped by migration `1779989084`
- `idx_financial_insights_active_priority` (partial) on `(priority DESC, created_at DESC) WHERE dismissed_at IS NULL` — added migration `1779989084`. Covers the hot-path "active insights sorted by priority" query without scanning dismissed rows.

### `transaction_overrides`

User corrections to Monarch's transaction categorization. Never mutated by re-syncs. Effective category at read time: override > rule > raw.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `transaction_external_id` | TEXT | UNIQUE. The Monarch transaction ID this override applies to. |
| `category` | TEXT | The corrected category. |
| `notes` | TEXT | Nullable. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_transaction_overrides_external` on `(transaction_external_id)` — dropped by migration `1779989084` (duplicated the implicit UNIQUE-constraint index)

The implicit UNIQUE index on `transaction_external_id` (from `UNIQUE` in the DDL) remains.

### `categorization_rules`

Pattern-based merchant categorization rules. Applied at read time after per-transaction overrides. Highest-`priority` rule wins for a given merchant name.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `merchant_pattern` | TEXT | Case-insensitive substring matched against `transactions.merchant`. |
| `account_id` | TEXT | Nullable. When set, the rule only applies to transactions on this account. |
| `category` | TEXT | |
| `priority` | INTEGER | Default `100`. Higher value = applied first. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Indexes:**
- `idx_categorization_rules_priority` on `(priority DESC, created_at DESC)`

---

## Transfer-exclusion note

Transfer exclusion uses a four-tier priority cascade in `isTransferTxn()` (`packages/core/src/financial/transfer.ts`):

1. **Tier 0** — `is_transfer = 1` (Monarch's own boolean, migration `1779979153`). Short-circuits all heuristics.
2. **Tier 1** — `category_group_type = 'transfer'` (migration `1779971644`).
3. **Tier 2** — `category` name contains substrings: `transfer`, `credit card payment`, `loan payment`, `balance adjustment` (fallback for older rows).
4. **Tier 3** — account-pair cross-reference (caller-supplied set of internal account IDs).

All four conditions independently produce exclusion; earlier tiers short-circuit later ones.

---

## Financial rollup computation (no table)

G5 itemization is computed on demand — no new table was added. The canonical rollup lives in `packages/core/src/financial/rollup.ts` and returns a `MonthlyRollup` struct with:

- `contributingTxIds: string[]` — IDs of all non-transfer transactions that contributed to income/expense totals.
- `transferTxIds: string[]` — IDs of excluded transfer transactions (audit trail).
- `guardsPassed: GuardResult[]` — G1–G6 guard evaluation results.
- `outlierMonthDetected: boolean` — true if any month in the window exceeds 1.5× the 6-month median.

This is computed from live transaction rows each time it is called; no rollup rows are persisted. The `measurements` table stores daily scalar snapshots (`monthly_burn_mtd`, `savings_rate_mtd`, etc.) for trend tracking, but these do not carry lineage. For any cited figure, call `financial_monthly_rollup` to get the full itemized rollup, then `get_rollup_contributors` to drill down to the raw rows.
