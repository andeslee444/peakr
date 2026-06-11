# Routing Claude API Calls Through Claude Max Subscription

## Problem
`scraper/hooks.py` currently calls the Anthropic API directly, which requires a paid API key (`sk-ant-api03-...`). Andes has a Claude Max subscription and wants to route these requests through that instead.

## Solution Options

### Option 1: OpenClaw's Built-in Endpoint (Recommended)

OpenClaw (running on this machine) can expose an OpenAI-compatible `/v1/chat/completions` endpoint that routes through Andes's Claude Max subscription.

**Endpoint:** `http://127.0.0.1:18789/v1/chat/completions`

**Required changes to `hooks.py`:**

1. Change the API call from Anthropic format to OpenAI format
2. Update the URL and headers
3. Convert the message structure

**Before (Anthropic format):**
```python
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
```

**After (OpenAI format for OpenClaw):**
```python
# Get from env or default to OpenClaw's local endpoint
OPENCLAW_URL = os.environ.get("OPENCLAW_URL", "http://127.0.0.1:18789/v1/chat/completions")
OPENCLAW_TOKEN = os.environ.get("OPENCLAW_TOKEN", "")  # Gateway auth token if configured

resp = httpx.post(
    OPENCLAW_URL,
    headers={
        "Authorization": f"Bearer {OPENCLAW_TOKEN}" if OPENCLAW_TOKEN else "",
        "Content-Type": "application/json",
    },
    json={
        "model": "openclaw:main",  # Routes to OpenClaw's main agent
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": HOOK_PROMPT},
            {"role": "user", "content": content},  # content array needs conversion (see below)
        ],
    },
    timeout=60.0,
)
```

**Important: Image content format conversion**

Anthropic uses:
```python
{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "..."}}
```

OpenAI format uses:
```python
{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
```

So the `content` array building needs to change:
```python
# For images (OpenAI format):
content.append({
    "type": "image_url",
    "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}
})

# For text:
content.append({"type": "text", "text": context_text})
```

**Response parsing also changes:**

Anthropic returns: `data["content"][0]["text"]`
OpenAI returns: `data["choices"][0]["message"]["content"]`

---

### Option 2: claude-max-api-proxy (Standalone)

A separate npm package that wraps Claude Code CLI:

```bash
npm install -g claude-max-api-proxy
claude-max-api  # runs on localhost:3456
```

Same code changes as Option 1, just different URL: `http://localhost:3456/v1/chat/completions`

---

## Recommendation

Use **Option 1** (OpenClaw endpoint) since OpenClaw is already running. The changes needed in `hooks.py`:

1. Swap URL to `http://127.0.0.1:18789/v1/chat/completions`
2. Change headers to `Authorization: Bearer <token>` (or empty if no auth)
3. Change `"model"` to `"openclaw:main"`
4. Move `system` prompt into messages array as `{"role": "system", "content": ...}`
5. Convert image format from Anthropic to OpenAI style
6. Change response parsing from `data["content"][0]["text"]` to `data["choices"][0]["message"]["content"]`

**Environment variables to add:**
- `OPENCLAW_URL` (optional, defaults to `http://127.0.0.1:18789/v1/chat/completions`)
- `OPENCLAW_TOKEN` = `openclaw` (the gateway auth token)

No more `ANTHROPIC_API_KEY` needed.

---

## Verified Working

The endpoint is now enabled and tested:

```bash
curl -sS http://127.0.0.1:18789/v1/chat/completions \
  -H 'Authorization: Bearer openclaw' \
  -H 'Content-Type: application/json' \
  -d '{"model":"openclaw:main","max_tokens":50,"messages":[{"role":"user","content":"hello"}]}'
```

Returns: `{"choices":[{"message":{"content":"Hello there, Andes! 🦞"}}]}`
