#!/usr/bin/env bash
# post-edit-schema.sh
# PostToolUse hook: fires when an edited file touches schema or migration paths.
# Emits a systemMessage reminding to keep docs/reference in sync.
# Fast path: exits 0 immediately for unrelated files.
# Output: JSON with continue:true and systemMessage (via jq).

set -euo pipefail

# ── 1. Read event JSON from stdin ──────────────────────────────────────────────
INPUT=$(cat)

# ── 2. Extract file path ───────────────────────────────────────────────────────
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

# No-op if no path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Normalise to absolute path
if [[ "$FILE_PATH" != /* ]]; then
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
  FILE_PATH="${CWD}/${FILE_PATH}"
fi

# ── 3. Fast-path: only act on schema/migration/sql paths ──────────────────────
# Matches: packages/schemas/**, packages/core/src/memory/migrations/**, *.sql
if [[ ! "$FILE_PATH" =~ /packages/schemas/ ]] && \
   [[ ! "$FILE_PATH" =~ /packages/core/src/memory/migrations/ ]] && \
   [[ ! "$FILE_PATH" =~ \.sql$ ]]; then
  exit 0
fi

# ── 4. Emit reminder systemMessage ────────────────────────────────────────────
FNAME=$(basename "$FILE_PATH")

MSG="Schema/migration edit detected [${FNAME}]. Required follow-up steps:
1. Update docs/reference/schema.md to reflect any added/removed/renamed tables or columns.
2. Bump docs/reference/migrations.md — append a row with the migration filename, timestamp, and summary.
3. If this changes a tool's input/output shape, notify mcp-protocol-engineer to update the affected tool spec under docs/specs/mcp-tools/.
4. Run \`pnpm -r typecheck\` to confirm generated types are still consistent."

jq -n \
  --arg msg "$MSG" \
  '{continue: true, suppressOutput: false, systemMessage: $msg}'

exit 0
