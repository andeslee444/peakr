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

echo "[predeploy] smoke-importing the daemon modules..."
# Import without a DB so a syntax/import error fails fast and loudly.
DATABASE_URL='' python3 -c "import scraper.db, scraper.daemon, scraper.analyze, scraper.tiktok, scraper.instagram; print('imports OK')"

echo "[predeploy] running pure (no-DB) unit tests..."
python3 -m pytest scraper/tests/ -q -k "not db"

echo "[predeploy] OK — safe to restart the daemon."
