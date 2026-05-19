#!/usr/bin/env bash
# Install the Lifecoach launchd schedule on macOS.
#
# Schedules:
#   06:00 daily       — daily reflection
#   07:30 daily       — insight pass (uses the morning reflection)
#   19:00 Sun         — weekly reflection
#
# What this does:
#   1. Substitutes the absolute repo path into each .plist template
#   2. Copies them to ~/Library/LaunchAgents/
#   3. Loads them via launchctl
#   4. Creates a log directory at <repo>/data/logs/
#
# Usage:
#   ./scripts/launchd/install.sh
#
# To uninstall later, run ./scripts/launchd/uninstall.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATES_DIR="$REPO_ROOT/scripts/launchd"
INSTALL_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$REPO_ROOT/data/logs"

mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# Locate pnpm so we can hardcode its path into the plists. launchd runs jobs
# with a minimal $PATH, so relying on the user's shell to find pnpm fails.
PNPM_PATH="$(command -v pnpm || true)"
if [[ -z "$PNPM_PATH" ]]; then
  echo "❌ pnpm not on PATH. Install pnpm first." >&2
  exit 1
fi

PLISTS=(
  "com.lifecoach.daily-reflect"
  "com.lifecoach.weekly-reflect"
  "com.lifecoach.insights"
)

for label in "${PLISTS[@]}"; do
  src="$TEMPLATES_DIR/$label.plist"
  dest="$INSTALL_DIR/$label.plist"

  echo "→ installing $label"

  # Substitute the repo root + pnpm path
  sed \
    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|/usr/local/bin/pnpm|$PNPM_PATH|g" \
    "$src" > "$dest"

  # Unload existing copy if present, then load fresh
  launchctl unload "$dest" 2>/dev/null || true
  launchctl load -w "$dest"

  echo "  loaded as $label"
done

echo
echo "✓ Installed. Verify with: launchctl list | grep lifecoach"
echo "  Logs land in:           $LOG_DIR"
echo "  Trigger one manually:   launchctl start com.lifecoach.daily-reflect"
