#!/usr/bin/env bash
# post-edit-tsx.sh
# PostToolUse hook: runs Prettier + ESLint --fix + tsc on edited .tsx files
# under packages/web. Fast path: exits 0 immediately for non-tsx files.
# Output: JSON with systemMessage surfacing results back to the agent.

set -euo pipefail

# ── 1. Read event JSON from stdin ──────────────────────────────────────────────
INPUT=$(cat)

# ── 2. Extract file path from the tool event ──────────────────────────────────
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no path or not a .tsx file under packages/web
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Normalise to absolute path
if [[ "$FILE_PATH" != /* ]]; then
  CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
  FILE_PATH="${CWD}/${FILE_PATH}"
fi

# Only run on .tsx files inside packages/web
if [[ ! "$FILE_PATH" =~ /packages/web/.*\.tsx$ ]]; then
  exit 0
fi

# Skip if file no longer exists (e.g. deleted)
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# ── 3. Locate repo root and packages/web ──────────────────────────────────────
REPO_ROOT=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
# Walk up to find the actual repo root (contains pnpm-workspace.yaml)
CANDIDATE="$REPO_ROOT"
while [[ "$CANDIDATE" != "/" ]]; do
  if [[ -f "$CANDIDATE/pnpm-workspace.yaml" ]]; then
    REPO_ROOT="$CANDIDATE"
    break
  fi
  CANDIDATE=$(dirname "$CANDIDATE")
done

WEB_ROOT="$REPO_ROOT/packages/web"

if [[ ! -d "$WEB_ROOT" ]]; then
  # Unexpected layout; bail silently rather than erroring
  exit 0
fi

# ── 4. Prettier — format in place (non-blocking) ──────────────────────────────
PRETTIER_STATUS="skipped"
if command -v pnpm &>/dev/null; then
  if pnpm --silent exec prettier --write --log-level error "$FILE_PATH" 2>/tmp/prettier-err; then
    PRETTIER_STATUS="formatted"
  else
    PRETTIER_STATUS="error: $(cat /tmp/prettier-err | head -3 | tr '\n' ' ')"
  fi
fi

# ── 5. ESLint --fix (non-blocking; runs from packages/web for correct config) ──
ESLINT_STATUS="skipped"
ESLINT_DETAIL=""
if command -v pnpm &>/dev/null && [[ -f "$WEB_ROOT/.eslintrc.cjs" || -f "$WEB_ROOT/eslint.config.js" || -f "$WEB_ROOT/eslint.config.mjs" || -f "$WEB_ROOT/.eslintrc.js" || -f "$WEB_ROOT/.eslintrc.json" ]]; then
  cd "$WEB_ROOT"
  if ESL_OUT=$(pnpm --silent exec eslint --fix --max-warnings=0 "$FILE_PATH" 2>&1); then
    ESLINT_STATUS="passed"
  else
    # Non-zero exit; capture the first few lines
    FIRST=$(printf '%s' "$ESL_OUT" | head -5 | tr '\n' ' ')
    ESLINT_STATUS="errors"
    ESLINT_DETAIL="$FIRST"
  fi
fi

# ── 6. TypeScript — scope to packages/web, no full rebuild ────────────────────
# tsc --noEmit scoped to packages/web is fast (<3s) vs a full repo typecheck.
# We accept the cost because TSX edits are the hot path for UI work.
TSC_STATUS="skipped"
TSC_DETAIL=""
if command -v pnpm &>/dev/null && [[ -f "$WEB_ROOT/tsconfig.json" ]]; then
  cd "$WEB_ROOT"
  if TSC_OUT=$(pnpm --filter @lifecoach/web typecheck 2>&1); then
    TSC_STATUS="passed"
  else
    # Surface first 5 lines of errors
    FIRST=$(printf '%s' "$TSC_OUT" | grep -E "error TS" | head -5 | tr '\n' '|')
    TSC_STATUS="errors"
    TSC_DETAIL="$FIRST"
  fi
fi

# ── 7. Build system message ────────────────────────────────────────────────────
FNAME=$(basename "$FILE_PATH")

if [[ "$ESLINT_STATUS" == "errors" || "$TSC_STATUS" == "errors" ]]; then
  # Surface failures clearly so the agent sees and fixes them
  MSG="Post-edit [${FNAME}]: prettier=${PRETTIER_STATUS} | eslint=${ESLINT_STATUS} | tsc=${TSC_STATUS}"
  if [[ -n "$ESLINT_DETAIL" ]]; then
    MSG="${MSG} | ESLint: ${ESLINT_DETAIL}"
  fi
  if [[ -n "$TSC_DETAIL" ]]; then
    MSG="${MSG} | TS errors: ${TSC_DETAIL}"
  fi
else
  MSG="Post-edit [${FNAME}]: prettier=${PRETTIER_STATUS} | eslint=${ESLINT_STATUS} | tsc=${TSC_STATUS}"
fi

# ── 8. Return JSON to Claude ───────────────────────────────────────────────────
jq -n \
  --arg msg "$MSG" \
  '{continue: true, suppressOutput: false, systemMessage: $msg}'

exit 0
