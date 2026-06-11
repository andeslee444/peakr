#!/usr/bin/env python3
"""Guard against drift between the two hand-maintained schemas:
  - src/lib/db.ts   (web, auto-creates on first access)
  - scraper/db.py   (daemon, auto-creates on import)

Both define `profiles` and `posts` (the core shared tables). This check fails if
their column sets diverge, except for columns that are intentionally one-sided
(listed in ALLOWED_ONLY_IN). It is deliberately scoped to the shared core — many
other tables legitimately live in only one schema.

Run: python3 scripts/check-schema-drift.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS = (ROOT / "src/lib/db.ts").read_text()
PY = (ROOT / "scraper/db.py").read_text()

SHARED_TABLES = ["profiles", "posts"]

# Columns that are intentionally only in the web schema (auth/billing concerns the
# daemon never touches). Anything else diverging is real drift.
ALLOWED_ONLY_IN = {
    "web": {
        "profiles": set(),
        "posts": set(),
    },
    "daemon": {
        "profiles": set(),
        "posts": set(),
    },
}

CONSTRAINT_KW = {"unique", "primary", "foreign", "constraint", "check", "references"}


def columns_for(sql_text: str, table: str) -> set:
    """Best-effort column extraction for one table: the CREATE TABLE body plus any
    ALTER TABLE ... ADD COLUMN statements."""
    cols = set()
    m = re.search(
        r"CREATE TABLE IF NOT EXISTS\s+" + re.escape(table) + r"\s*\((.*?)\)\s*;",
        sql_text,
        re.DOTALL | re.IGNORECASE,
    )
    if m:
        for line in m.group(1).splitlines():
            line = line.strip().strip(",").strip()
            if not line:
                continue
            first = line.split()[0].lower()
            if first in CONSTRAINT_KW:
                continue
            if re.match(r"^[a-z_][a-z0-9_]*$", first):
                cols.add(first)
    for am in re.finditer(
        r"ALTER TABLE\s+" + re.escape(table) + r"\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)",
        sql_text,
        re.IGNORECASE,
    ):
        cols.add(am.group(1).lower())
    return cols


def main() -> int:
    drift = []
    for table in SHARED_TABLES:
        web = columns_for(TS, table)
        daemon = columns_for(PY, table)
        if not web or not daemon:
            drift.append(f"[{table}] could not parse columns (web={len(web)}, daemon={len(daemon)})")
            continue
        only_web = web - daemon - ALLOWED_ONLY_IN["web"][table]
        only_daemon = daemon - web - ALLOWED_ONLY_IN["daemon"][table]
        if only_web:
            drift.append(f"[{table}] only in web (src/lib/db.ts): {sorted(only_web)}")
        if only_daemon:
            drift.append(f"[{table}] only in daemon (scraper/db.py): {sorted(only_daemon)}")

    if drift:
        print("Schema drift detected between src/lib/db.ts and scraper/db.py:")
        for d in drift:
            print("  - " + d)
        print("\nAdd the column to both schemas, or whitelist it in ALLOWED_ONLY_IN.")
        return 1
    print("Schema drift check passed (profiles + posts columns match).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
