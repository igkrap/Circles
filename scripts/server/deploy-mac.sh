#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BRANCH="${BRANCH:-main}"
LABEL="${LABEL:-io.igkrap.circles.server}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:30000/health}"

cd "$REPO_DIR"

echo "[1/5] fetch latest code"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[2/5] install dependencies"
npm ci --omit=dev

echo "[3/5] install/reload launchd service"
bash scripts/server/install-launchd.sh

echo "[4/5] wait for server health check"
for i in {1..30}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[ok] server is healthy: $HEALTH_URL"
    break
  fi
  sleep 1
done

echo "[5/5] done"
