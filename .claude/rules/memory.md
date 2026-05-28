---
paths:
  - "packages/core/src/memory/**"
  - "packages/schemas/**"
  - "**/*.sql"
---

# Memory Systems Rules

Rules for all work touching the SQLite memory layer, schemas package, and SQL migrations.

## Migration naming convention

Migration files must follow the pattern: `<unix-timestamp>_<verb>_<noun>.sql`

- Unix timestamp: seconds since epoch at time of creation (use `date +%s`).
- Verb: imperative form — `create`, `add`, `drop`, `alter`, `rename`, `seed`, `index`.
- Noun: snake_case table or concept name — `memory_chunks`, `embedding_refs`, `tax_lots`.
- Example: `1748300000_create_memory_chunks.sql`

The `new-migration` skill generates this automatically. Do not hand-write timestamps.

## sqlite-vec dimension invariant

The embedding dimension stored in the vector table **must** equal `VOYAGE_EMBED_DIM` (environment variable, default `1024`).

- At startup, assert: `SELECT dim FROM vec_chunks LIMIT 1` equals `parseInt(process.env.VOYAGE_EMBED_DIM ?? '1024')`.
- If dim drifts, the entire vector index is corrupted. Treat this as a hard error, not a warning.
- Never create a migration that changes vector column dim without also dropping and rebuilding all affected vec tables and re-embedding all stored data.
- Document any dim change in `docs/reference/migrations.md` with a `BREAKING` label.

## Repository pattern

All database access must go through repository classes under `packages/core/src/memory/storage/repositories/`.

- **CRUD in repositories.** No raw SQL in controllers, services, or tool handlers.
- **Prepared statements.** Use parameterised queries for all user-supplied values; never string-interpolate into SQL.
- **Transactional boundaries.** Operations that touch multiple tables must be wrapped in a single transaction (`db.transaction(fn)`). Never allow partial writes.
- **No global db handle.** Inject the database instance via constructor or factory; never import a singleton from a side-effecting module.

## Soft-delete patterns

Entities that the user may want to recover must use soft-delete:

- Add a `deleted_at INTEGER` column (unix timestamp, nullable).
- Default all queries to `WHERE deleted_at IS NULL`.
- Provide a `restore` method in the repository.
- Hard-delete is reserved for data the user explicitly purges.

## Embedding reference tracking

Every embedded chunk must have a corresponding row in `embedding_refs` (or equivalent) recording:

- `source_id` — foreign key to the originating entity.
- `model` — the Voyage model name used (e.g. `voyage-3-large`).
- `dim` — the dimension at embed time.
- `embedded_at` — unix timestamp.
- `chunk_index` — position in the source document.

This enables targeted re-embedding when the model or dim changes without a full wipe.

## Schema change checklist

Before merging any schema change:

1. New migration file follows the naming convention above.
2. `docs/reference/schema.md` updated with new/altered tables.
3. `docs/reference/migrations.md` has a new row for the migration.
4. `pnpm -r typecheck` passes.
5. If a vector column dim changes, all affected `embedding_refs` rows are invalidated and re-embed is scheduled.
