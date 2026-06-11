#!/usr/bin/env bash
# Pre-restart smoke gate for the Mac Mini scraper daemon.
#
# The Mini auto-pulls from GitHub and restarts the daemon. A bad commit (e.g. a
# broken top-level import) would crash-loop under launchd with the only signal
# being a stale heartbeat. Run this BEFORE restarting; on non-zero exit, keep the
# old process running and alert instead of swapping in a broken build.
#
# Usage (in the Mini's pull hook):
#   git pull && bash scripts/predeploy-check.sh && launchctl kickstart -k <daemon>
set -euo pipefail

cd "$(dirname "$0")/.."

# Prefer the project venv (the daemon's actual interpreter), so the real
# dependencies are present; fall back to python3 if there's no venv.
PY="python3"
[ -x ".venv/bin/python" ] && PY=".venv/bin/python"
echo "[predeploy] interpreter: $PY"

echo "[predeploy] smoke-importing the daemon modules..."
DATABASE_URL='' "$PY" -c "import scraper.db, scraper.daemon, scraper.analyze, scraper.tiktok, scraper.instagram, scraper.transcribe; print('imports OK')"

echo "[predeploy] running pure (no-DB) unit tests..."
if "$PY" -c "import pytest" 2>/dev/null; then
  "$PY" -m pytest scraper/tests/ -q -k "not db"
else
  echo "[predeploy] pytest not installed in $PY — skipping tests (imports already passed)"
fi

echo "[predeploy] OK — safe to restart the daemon."
