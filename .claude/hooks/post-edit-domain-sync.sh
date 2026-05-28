#!/usr/bin/env bash
# post-edit-domain-sync.sh
# PostToolUse hook: after any file edit, grep docs/briefs/ and docs/specs/ for
# frontmatter code_paths: entries that mention the edited file's directory.
# If hits are found, emit a systemMessage listing the stale docs.
# Non-blocking. Fast path: skips edits inside /docs/.

set -euo pipefail

# ── 1. Read event JSON from stdin ──────────────────────────────────────────────
INPUT=$(cat)

# ── 2. Extract file path and cwd ──────────────────────────────────────────────
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')

# No-op if no path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Normalise to absolute path
if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="${CWD}/${FILE_PATH}"
fi

# ── 3. Fast-path: skip edits inside /docs/ ────────────────────────────────────
if [[ "$FILE_PATH" =~ /docs/ ]]; then
  exit 0
fi

# ── 4. Locate repo root (walk up to find pnpm-workspace.yaml) ─────────────────
REPO_ROOT="$CWD"
CANDIDATE="$REPO_ROOT"
while [[ "$CANDIDATE" != "/" ]]; do
  if [[ -f "$CANDIDATE/pnpm-workspace.yaml" ]]; then
    REPO_ROOT="$CANDIDATE"
    break
  fi
  CANDIDATE=$(dirname "$CANDIDATE")
done

DOCS_DIR="${REPO_ROOT}/docs"

# No-op if docs directory doesn't exist yet
if [[ ! -d "$DOCS_DIR" ]]; then
  exit 0
fi

# ── 5. Derive directory name heuristic ────────────────────────────────────────
# Use the immediate parent directory name of the edited file as the search term.
# e.g. editing packages/core/src/memory/storage/foo.ts → search "memory"
DIR_NAME=$(basename "$(dirname "$FILE_PATH")")

# Also grab the package-level segment if available (e.g. "core", "schemas")
# We extract the second path component after /packages/ if present.
PKG_NAME=""
if [[ "$FILE_PATH" =~ /packages/([^/]+)/ ]]; then
  PKG_NAME="${BASH_REMATCH[1]}"
fi

# ── 6. Grep docs/briefs/ and docs/specs/ for code_paths: mentions ─────────────
HITS=()

# Search pattern: lines containing "code_paths:" or the dir/pkg name near such lines
# Cheap heuristic: grep for the directory name in any line that looks like a code_paths entry
for SEARCH_DIR in "${DOCS_DIR}/briefs" "${DOCS_DIR}/specs"; do
  if [[ ! -d "$SEARCH_DIR" ]]; then
    continue
  fi

  while IFS= read -r -d '' DOC_FILE; do
    # Check if file mentions the dir name or pkg name in a code_paths context
    if grep -qE "code_paths:" "$DOC_FILE" 2>/dev/null; then
      if grep -qE "(${DIR_NAME}|${PKG_NAME})" "$DOC_FILE" 2>/dev/null; then
        # Relativise path for readability
        REL_PATH="${DOC_FILE#"${REPO_ROOT}/"}"
        HITS+=("$REL_PATH")
      fi
    fi
  done < <(find "$SEARCH_DIR" -type f -name "*.md" -print0 2>/dev/null)
done

# No-op if no hits
if [[ ${#HITS[@]} -eq 0 ]]; then
  exit 0
fi

# ── 7. Build systemMessage listing stale docs ──────────────────────────────────
FNAME=$(basename "$FILE_PATH")
HIT_LIST=$(printf '  - %s\n' "${HITS[@]}")

MSG="Domain-sync: edit to [${FNAME}] may affect these briefs/specs whose code_paths reference '${DIR_NAME}' or '${PKG_NAME}':
${HIT_LIST}
Action required:
  • Update last_implemented: <date> in each affected frontmatter.
  • Append a ## Changelog entry describing what changed.
  • If the spec is now stale, flip status: in-progress or needs-input and notify the owner agent."

jq -n \
  --arg msg "$MSG" \
  '{continue: true, suppressOutput: false, systemMessage: $msg}'

exit 0
