"""Exponential backoff for persistently-failing profile scrapes.

Pure logic; the daemon keeps the per-profile failure counts in memory.
"""

BASE_BACKOFF_S = 300          # 5 minutes after the first failure
MAX_BACKOFF_S = 6 * 3600      # cap at 6 hours

# After this many consecutive failures a profile is considered dead (deleted /
# private / banned) and is reaped from the active scrape set instead of being
# retried forever. Persisted on the profile row so a restart doesn't forget.
REAP_THRESHOLD = 10


def backoff_seconds(failures: int) -> float:
    """How long to wait before retrying after `failures` consecutive failures."""
    if failures <= 0:
        return 0
    return min(BASE_BACKOFF_S * (2 ** (failures - 1)), MAX_BACKOFF_S)


def should_attempt(failures: int, last_attempt_ts: float, now_ts: float) -> bool:
    """Whether enough time has passed since the last failed attempt to retry."""
    return (now_ts - last_attempt_ts) >= backoff_seconds(failures)
