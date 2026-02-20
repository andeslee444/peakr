"""Claude API hook analysis with vision (keyframes + transcript)."""

import os
import json
import base64
import logging
from typing import Optional
import httpx

log = logging.getLogger("peakr-hooks")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"

HOOK_PROMPT = """You are analyzing a viral short-form video (TikTok or Instagram Reel) to understand what makes its "hook" work — the first 3-5 seconds that grab attention.

You are given:
- The full transcript of the video
- 4 keyframe images from the first 5 seconds
- Video metadata (description, views, likes, viral score, duration)

Analyze the hook and return a JSON object with these fields:

{
  "hook_type": one of: "question", "shock/surprise", "curiosity gap", "story opener", "bold claim", "visual spectacle", "direct address", "trend/sound", "before/after", "social proof", "POV", "tutorial/value",
  "hook_text": "the exact opening words from the first 3-5 seconds of the transcript",
  "hook_visual": "description of what's visually shown in the hook frames",
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
    """Analyze a video's hook using Claude API with vision."""
    if not ANTHROPIC_API_KEY:
        log.error("ANTHROPIC_API_KEY not set")
        return None

    # Build content blocks: keyframe images + text context
    content = []

    for path in keyframe_paths:
        try:
            with open(path, "rb") as f:
                img_data = base64.standard_b64encode(f.read()).decode("utf-8")
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": img_data,
                },
            })
        except Exception as e:
            log.warning(f"Could not read keyframe {path}: {e}")

    context_text = f"""Video metadata:
- Description: {description or 'N/A'}
- Views: {views:,}
- Likes: {likes:,}
- Viral score: {viral_score:.1f}x
- Duration: {duration}s

Full transcript:
{transcript or '(no speech detected)'}"""

    content.append({"type": "text", "text": context_text})

    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 1024,
                "system": HOOK_PROMPT,
                "messages": [{"role": "user", "content": content}],
            },
            timeout=60.0,
        )

        if resp.status_code != 200:
            log.error(f"Claude API error {resp.status_code}: {resp.text[:300]}")
            return None

        data = resp.json()
        text = data["content"][0]["text"]

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
        log.error(f"Failed to parse Claude response as JSON: {e}")
        return None
    except Exception as e:
        log.error(f"Claude API request failed: {e}")
        return None
