"""Pure decision logic for hook-analysis retry/failure state.

Kept dependency-free so the daemon's most failure-prone path can be unit-tested
without a database. The daemon (daemon.py) and the analyzer (analyze.py) import
these helpers; the DB write of the resulting marker lives in db.py.
"""

import json
from typing import Optional

# A post that fails analysis this many times is marked terminally failed and is
# never re-selected (prevents the failed-post-starves-the-daemon livelock).
MAX_ANALYSIS_ATTEMPTS = 3

# Deterministic skip reasons get marked terminal on the first attempt — retrying
# them can never succeed.
DETERMINISTIC_SKIP_REASONS = ("no_url", "too_long")

MAX_DURATION_SECONDS = 300


def skip_reason(post: dict) -> Optional[str]:
    """Return a deterministic reason this post cannot be analyzed, or None."""
    if not post.get("post_url"):
        return "no_url"
    if (post.get("duration_seconds") or 0) > MAX_DURATION_SECONDS:
        return "too_long"
    return None


def parse_attempts(hook_analysis) -> int:
    """Extract the prior attempt count from a post's hook_analysis value.

    Accepts a dict, a JSON string, or None. Returns 0 when not present/parseable.
    """
    data = _coerce(hook_analysis)
    if not isinstance(data, dict):
        return 0
    try:
        return int(data.get("attempts", 0))
    except (TypeError, ValueError):
        return 0


def failure_marker(attempts: int, reason: str = "") -> dict:
    """Build the JSONB marker written to a post when analysis fails."""
    return {"status": "failed", "attempts": attempts, "reason": reason}


def is_terminal_failure(hook_analysis, max_attempts: int = MAX_ANALYSIS_ATTEMPTS) -> bool:
    """True if this post has failed analysis enough times to stop retrying."""
    data = _coerce(hook_analysis)
    if not isinstance(data, dict):
        return False
    if data.get("status") != "failed":
        return False
    return parse_attempts(data) >= max_attempts


def _coerce(hook_analysis):
    if isinstance(hook_analysis, str):
        try:
            return json.loads(hook_analysis)
        except (ValueError, TypeError):
            return None
    return hook_analysis
