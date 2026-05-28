#!/usr/bin/env bash
set -Eeuo pipefail

# Production deploy entrypoint for the Mac Mini.
# Run from the checked-out repository root. Intended to be called over SSH by
# GitHub Actions after the workflow joins the tailnet.

if ! ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "Error: deploy-production.sh must run inside the lifecoach git checkout." >&2
  exit 1
fi
cd "$ROOT_DIR"

export PATH="$HOME/.volta/bin:$HOME/.volta/shims:$HOME/Library/pnpm:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"
export LIFECOACH_ENV="${LIFECOACH_ENV:-production}"
export NODE_ENV="${NODE_ENV:-production}"

required_commands=(curl git node pnpm pm2)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: required command not found: $command_name" >&2
    echo "PATH=$PATH" >&2
    exit 1
  fi
done

required_node_major="22"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" != "$required_node_major" ]; then
  echo "Error: Node.js $required_node_major.x is required for production deploy; found $(node --version)." >&2
  exit 1
fi

required_pnpm_version="11.1.0"
pnpm_version="$(pnpm --version)"
if [ "$pnpm_version" != "$required_pnpm_version" ]; then
  echo "Error: pnpm $required_pnpm_version is required for production deploy; found $pnpm_version." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "main" ]; then
  echo "Error: production checkout must be on main; found '$current_branch'" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: production checkout has local tracked changes. Refusing to deploy." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

before_sha="$(git rev-parse --short HEAD)"

echo "Fetching origin/main..."
git fetch --prune origin main

echo "Fast-forwarding production checkout..."
git merge --ff-only origin/main

after_sha="$(git rev-parse --short HEAD)"
echo "Production checkout: $before_sha -> $after_sha"

export LIFECOACH_GIT_SHA="$after_sha"
export LIFECOACH_GIT_BRANCH="$current_branch"
export LIFECOACH_BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Deployment fingerprint: $LIFECOACH_GIT_BRANCH@$LIFECOACH_GIT_SHA built $LIFECOACH_BUILD_TIME"

for env_file in ".env.production" ".env"; do
  if [ -f "$env_file" ] && grep -Eq '^[[:space:]]*LIFECOACH_DATA_DIR=' "$env_file"; then
    echo "Warning: $env_file sets LIFECOACH_DATA_DIR, which overrides LIFECOACH_ENV data-directory selection." >&2
  fi
done

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building workspace..."
pnpm build

echo "Running database migrations..."
echo "Note: migrations can include schema constraints. Check docs/deployment.md for manual preflights before first deploy after new migrations."
pnpm lifecoach init --no-profile

echo "Reloading PM2 ecosystem..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

port="${PORT:-}"
if [ -z "$port" ]; then
  for env_file in ".env.production" ".env"; do
    if [ ! -f "$env_file" ]; then
      continue
    fi

    port="$(awk -F= '/^[[:space:]]*PORT=/{print substr($0, index($0, "=")+1)}' "$env_file" | tail -n 1)"
    port="${port%\"}"
    port="${port#\"}"
    port="${port%\'}"
    port="${port#\'}"

    if [ -n "$port" ]; then
      break
    fi
  done
fi
port="${port:-3717}"

echo "Checking server health on http://127.0.0.1:$port/health..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:$port/health" >/dev/null; then
    echo "Health check passed."
    echo "Production deploy complete."
    exit 0
  fi

  echo "Health check not ready yet ($attempt/30)."
  sleep 1
done

echo "Error: server health check failed after 30 seconds." >&2
pm2 status >&2 || true
exit 1
