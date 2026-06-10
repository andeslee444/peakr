from scraper.backoff import backoff_seconds, should_attempt, MAX_BACKOFF_S


def test_backoff_grows_exponentially():
    assert backoff_seconds(0) == 0
    assert backoff_seconds(1) == 300
    assert backoff_seconds(2) == 600
    assert backoff_seconds(3) == 1200


def test_backoff_is_capped():
    assert backoff_seconds(100) == MAX_BACKOFF_S


def test_should_attempt_with_no_failures():
    assert should_attempt(0, last_attempt_ts=0, now_ts=0) is True


def test_should_attempt_respects_backoff_window():
    # 2 failures -> 600s backoff
    assert should_attempt(2, last_attempt_ts=1000, now_ts=1300) is False  # only 300s elapsed
    assert should_attempt(2, last_attempt_ts=1000, now_ts=1700) is True   # 700s elapsed
