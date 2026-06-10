"""Pure-logic tests for analysis retry/failure state (no DB)."""

from scraper.analysis_state import (
    MAX_ANALYSIS_ATTEMPTS,
    skip_reason,
    parse_attempts,
    failure_marker,
    is_terminal_failure,
)


class TestSkipReason:
    def test_missing_url_is_skipped(self):
        assert skip_reason({"id": 1, "post_url": "", "duration_seconds": 10}) == "no_url"
        assert skip_reason({"id": 1, "duration_seconds": 10}) == "no_url"

    def test_too_long_is_skipped(self):
        assert skip_reason({"post_url": "x", "duration_seconds": 301}) == "too_long"

    def test_ok_post_has_no_skip_reason(self):
        assert skip_reason({"post_url": "x", "duration_seconds": 120}) is None
        assert skip_reason({"post_url": "x", "duration_seconds": None}) is None


class TestParseAttempts:
    def test_pending_marker_is_zero_attempts(self):
        assert parse_attempts({"status": "pending"}) == 0

    def test_none_is_zero(self):
        assert parse_attempts(None) == 0

    def test_reads_attempts_from_failed_dict(self):
        assert parse_attempts({"status": "failed", "attempts": 2}) == 2

    def test_reads_attempts_from_json_string(self):
        assert parse_attempts('{"status": "failed", "attempts": 3}') == 3

    def test_malformed_string_is_zero(self):
        assert parse_attempts("not json") == 0


class TestFailureMarker:
    def test_shape(self):
        m = failure_marker(1, reason="too_long")
        assert m["status"] == "failed"
        assert m["attempts"] == 1
        assert m["reason"] == "too_long"


class TestIsTerminalFailure:
    def test_failed_at_max_is_terminal(self):
        assert is_terminal_failure({"status": "failed", "attempts": MAX_ANALYSIS_ATTEMPTS}) is True

    def test_failed_below_max_is_retryable(self):
        assert is_terminal_failure({"status": "failed", "attempts": 1}) is False

    def test_pending_is_not_terminal(self):
        assert is_terminal_failure({"status": "pending"}) is False

    def test_none_is_not_terminal(self):
        assert is_terminal_failure(None) is False
