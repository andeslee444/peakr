"""Error monitoring for the scraper daemon, gated on SENTRY_DSN.

No-op (logged) when SENTRY_DSN is unset or sentry_sdk is not installed, so the
daemon runs anywhere without an account.
"""

import os
import logging

log = logging.getLogger("peakr-observability")

_initialized = False
_sentry = None


def init_sentry() -> bool:
    """Initialize Sentry if configured. Returns True if active."""
    global _initialized, _sentry
    if _initialized:
        return _sentry is not None
    _initialized = True

    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.environ.get("SENTRY_ENV", "production"),
        )
        _sentry = sentry_sdk
        log.info("Sentry initialized")
        return True
    except Exception as e:  # ImportError or init failure
        log.error("Sentry init failed: %s", e)
        return False


def capture_exception(err: BaseException) -> None:
    """Report an exception to Sentry if active; otherwise log it."""
    if _sentry is not None:
        try:
            _sentry.capture_exception(err)
            return
        except Exception:
            pass
    log.error("Captured exception (Sentry inactive): %s", err)
