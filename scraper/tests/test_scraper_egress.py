"""Pure-logic tests for TikTok extraction-health detection + yt-dlp proxy routing."""

from scraper.tiktok import is_extraction_broken
from scraper import proxy


class TestIsExtractionBroken:
    def test_real_profile_with_zero_videos_is_not_broken(self):
        # A genuinely empty/private account still yields metadata.
        meta = {"display_name": "Real Person", "followers": 1200, "post_count": 0}
        assert is_extraction_broken(meta, 0) is False

    def test_no_metadata_and_zero_videos_is_broken(self):
        # No metadata + no videos => the page structure changed, not "success 0".
        assert is_extraction_broken({}, 0) is True

    def test_no_metadata_but_videos_present_is_not_broken(self):
        assert is_extraction_broken({}, 5) is False

    def test_only_display_name_counts_as_metadata(self):
        assert is_extraction_broken({"display_name": "x"}, 0) is False


class TestYtdlpProxyArgs:
    def test_routes_through_proxy_when_running(self, monkeypatch):
        monkeypatch.setattr(proxy, "is_wireproxy_running", lambda: True)
        args = proxy.ytdlp_proxy_args()
        assert "--proxy" in args
        joined = " ".join(args)
        assert "1080" in joined

    def test_no_proxy_args_when_proxy_down(self, monkeypatch):
        monkeypatch.setattr(proxy, "is_wireproxy_running", lambda: False)
        assert proxy.ytdlp_proxy_args() == []
