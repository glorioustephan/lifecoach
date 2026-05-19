#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/Library/LaunchAgents"

PLISTS=(
  "com.lifecoach.daily-reflect"
  "com.lifecoach.weekly-reflect"
  "com.lifecoach.insights"
)

for label in "${PLISTS[@]}"; do
  plist="$INSTALL_DIR/$label.plist"
  if [[ -f "$plist" ]]; then
    echo "→ unloading $label"
    launchctl unload "$plist" 2>/dev/null || true
    rm "$plist"
  else
    echo "  (no $label.plist installed — skipping)"
  fi
done

echo
echo "✓ Uninstalled."
