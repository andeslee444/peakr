"""Hook analysis via OpenClaw (routes through Claude Max subscription)."""

import os
import json
import logging
from typing import Optional
import httpx

log = logging.getLogger("peakr-hooks")

OPENCLAW_URL = os.environ.get("OPENCLAW_URL", "http://127.0.0.1:18789/v1/chat/completions")
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_TOKEN", "openclaw")
MODEL = "openclaw:main"

HOOK_PROMPT = """You are analyzing a viral short-form video (TikTok or Instagram Reel) to understand what makes its "hook" work — the first 3-5 seconds that grab attention.

You are given:
- The full transcript of the video (if available)
- Video metadata (description, views, likes, viral score, duration)

Based on the description and transcript, analyze the hook and return a JSON object with these fields:

{
  "hook_type": one of: "question", "shock/surprise", "curiosity gap", "story opener", "bold claim", "visual spectacle", "direct address", "trend/sound", "before/after", "social proof", "POV", "tutorial/value",
  "hook_text": "the exact opening words from the first 3-5 seconds of the transcript (or infer from description if no transcript)",
  "hook_visual": "best guess of what's visually shown based on the description and context",
  "hook_explanation": "2-3 sentences explaining why this hook works and what psychological trigger it uses",
  "hook_score": integer 1-10 rating of hook effectiveness,
  "niche": one of: "fitness", "finance", "business", "beauty", "food", "comedy", "lifestyle", "health", "fashion", "tech", "real-estate", "education", "motivation", "travel", "parenting",
  "hook_format": one of: "text overlay", "talking head", "voiceover + b-roll", "skit/acting", "screen recording", "slideshow", "transition reveal", "green screen",
  "target_audience": "1-2 word description of who this content targets (e.g. 'gym beginners', 'young moms', 'tech workers')",
  "emotional_trigger": one of: "fear of missing out", "curiosity", "aspiration", "shock/awe", "humor", "empathy", "urgency", "controversy", "nostalgia",
  "cta_type": one of: "follow", "like/save", "comment", "share", "link/bio", "none" (or null if no CTA),
  "hook_template": "a reusable template version of the hook with [BRACKETS] for swappable parts, e.g. 'I tried [THING] for [TIME PERIOD] and here's what happened'"
}

Return ONLY the JSON object, no other text."""


def analyze_hook(
    transcript: str,
    keyframe_paths: list[str],
    description: str = "",
    views: int = 0,
    likes: int = 0,
    viral_score: float = 0,
    duration: int = 0,
) -> Optional[dict]:
    """Analyze a video's hook via OpenClaw (Claude Max)."""

    context_text = f"""Video metadata:
- Description: {description or 'N/A'}
- Views: {views:,}
- Likes: {likes:,}
- Viral score: {viral_score:.1f}x
- Duration: {duration}s

Full transcript:
{transcript or '(no speech detected)'}"""

    content = context_text

    try:
        resp = httpx.post(
            OPENCLAW_URL,
            headers={
                "Authorization": f"Bearer {OPENCLAW_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 1024,
                "messages": [
                    {"role": "system", "content": HOOK_PROMPT},
                    {"role": "user", "content": content},
                ],
            },
            timeout=120.0,
        )

        if resp.status_code != 200:
            log.error(f"OpenClaw API error {resp.status_code}: {resp.text[:300]}")
            return None

        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        log.info(f"OpenClaw response preview: {text[:200]}")

        # Parse JSON from response (handle markdown code blocks)
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        text = text.strip()

        result = json.loads(text)

        # Validate required fields
        required = ["hook_type", "hook_text", "hook_visual", "hook_explanation", "hook_score",
                     "niche", "hook_format", "target_audience", "emotional_trigger", "cta_type", "hook_template"]
        if not all(k in result for k in required):
            log.error(f"Missing fields in hook analysis: {result.keys()}")
            return None

        result["hook_score"] = int(result["hook_score"])
        return result

    except json.JSONDecodeError as e:
        log.error(f"Failed to parse response as JSON: {e}")
        return None
    except Exception as e:
        log.error(f"OpenClaw API request failed: {e}")
        return None
