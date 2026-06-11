"""Bounded-concurrency processing for the analysis pass.

These tests exercise ``_analyze_concurrently`` in isolation — no DB, no network.
The worker function is injected so we can observe concurrency, success counts,
and exception resilience without touching the real download/transcribe/LLM path.
"""

import threading
import time

import scraper.analyze as analyze


def _make_concurrency_probe(behavior=lambda post: True):
    """Build a fake worker that records the peak number of in-flight calls.

    ``behavior(post)`` decides the return value (or raises) for each post.
    Returns (worker, state) where state["max_inflight"] is the observed peak.
    """
    state = {"inflight": 0, "max_inflight": 0}
    lock = threading.Lock()

    def worker(post):
        with lock:
            state["inflight"] += 1
            state["max_inflight"] = max(state["max_inflight"], state["inflight"])
        try:
            # Hold the slot briefly so genuinely-concurrent calls overlap.
            time.sleep(0.05)
            return behavior(post)
        finally:
            with lock:
                state["inflight"] -= 1

    return worker, state


def test_concurrency_never_exceeds_max_workers():
    worker, state = _make_concurrency_probe(behavior=lambda post: True)
    posts = [{"id": i} for i in range(20)]

    analyze._analyze_concurrently(posts, max_workers=3, worker=worker)

    assert state["max_inflight"] <= 3
    # And it should actually have run more than one at a time.
    assert state["max_inflight"] >= 2


def test_returns_count_of_successes_with_mixed_results():
    # Even ids succeed (True), odd ids fail (False).
    worker, _ = _make_concurrency_probe(behavior=lambda post: post["id"] % 2 == 0)
    posts = [{"id": i} for i in range(10)]  # ids 0,2,4,6,8 -> 5 successes

    analyzed = analyze._analyze_concurrently(posts, max_workers=4, worker=worker)

    assert analyzed == 5


def test_exception_in_one_post_does_not_abort_the_batch():
    def behavior(post):
        if post["id"] == 2:
            raise RuntimeError("boom")
        return True

    worker, _ = _make_concurrency_probe(behavior=behavior)
    posts = [{"id": i} for i in range(5)]  # id 2 raises, other 4 succeed

    analyzed = analyze._analyze_concurrently(posts, max_workers=3, worker=worker)

    # The exception is counted as a failure; the other four still complete.
    assert analyzed == 4


def test_empty_list_returns_zero():
    worker, _ = _make_concurrency_probe()
    assert analyze._analyze_concurrently([], max_workers=3, worker=worker) == 0


def test_default_worker_is_the_real_analyze_post():
    import inspect

    sig = inspect.signature(analyze._analyze_concurrently)
    assert sig.parameters["worker"].default is analyze.analyze_post
