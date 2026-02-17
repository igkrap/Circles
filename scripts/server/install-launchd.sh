#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-io.igkrap.circles.server}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.server}"
PLIST_PATH="${PLIST_PATH:-$HOME/Library/LaunchAgents/$LABEL.plist}"
LOG_DIR="${LOG_DIR:-$REPO_DIR/logs}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

if [[ -z "${NODE_BIN}" ]]; then
  echo "[error] node binary not found in PATH"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[error] env file not found: $ENV_FILE"
  echo "Copy server/.env.server.example to .env.server and edit values first."
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_PATH")"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
      <string>$NODE_BIN</string>
      <string>--env-file=$ENV_FILE</string>
      <string>$REPO_DIR/server/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$REPO_DIR</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/server.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/server.err.log</string>
  </dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "[ok] launchd service installed: $LABEL"
echo "[info] plist: $PLIST_PATH"
echo "[info] logs: $LOG_DIR/server.out.log / $LOG_DIR/server.err.log"
