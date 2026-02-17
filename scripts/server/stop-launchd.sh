#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-io.igkrap.circles.server}"
PLIST_PATH="${PLIST_PATH:-$HOME/Library/LaunchAgents/$LABEL.plist}"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "[ok] launchd service removed: $LABEL"
