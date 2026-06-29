"""
fetcher-service — Agent-Reach HTTP wrapper for hermes-agent.

POST /fetch   {url, platform}  → {text, platform}
GET  /health                   → {status}
GET  /check?platform=reddit    → {platform, status, message}

hermes-agent (network_mode: host) calls this at http://localhost:8081.
Auth config is bind-mounted at /root/.config (see DEPLOY.md §fetcher-service).
"""
import asyncio
import urllib.request
import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

JINA_API_KEY = os.environ.get("JINA_API_KEY", "")

# ---- lazy channel singletons ----

_reddit_ch = None
_twitter_ch = None


def _reddit():
    global _reddit_ch
    if _reddit_ch is None:
        try:
            from agent_reach.channels.reddit import RedditChannel
            _reddit_ch = RedditChannel()
        except Exception:
            pass
    return _reddit_ch


def _twitter():
    global _twitter_ch
    if _twitter_ch is None:
        try:
            from agent_reach.channels.twitter import TwitterChannel
            _twitter_ch = TwitterChannel()
        except Exception:
            pass
    return _twitter_ch


# ---- request / response models ----

class FetchRequest(BaseModel):
    url: str
    platform: Literal["reddit", "twitter", "web"] = "web"


# ---- endpoints ----

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/check")
def check(platform: str = "reddit"):
    ch = _reddit() if platform == "reddit" else _twitter() if platform == "twitter" else None
    if ch is None:
        return {"platform": platform, "status": "not_installed", "message": "channel not available"}
    try:
        status, msg = ch.check()
        return {"platform": platform, "status": status, "message": msg}
    except Exception as e:
        return {"platform": platform, "status": "error", "message": str(e)}


@app.post("/fetch")
async def fetch(req: FetchRequest):
    if req.platform == "reddit":
        text = await _fetch_reddit(req.url)
    elif req.platform == "twitter":
        text = await _fetch_twitter(req.url)
    else:
        text = _fetch_jina(req.url)

    if not text or len(text.strip()) < 80:
        raise HTTPException(502, "fetch returned empty or too-thin content")

    return {"text": text[:8000], "platform": req.platform}


# ---- platform fetch implementations ----

async def _fetch_reddit(url: str) -> str:
    ch = _reddit()
    if ch is None:
        raise HTTPException(503, "Reddit channel not installed (run: agent-reach install --env=server)")

    # Try Agent-Reach channel (rdt-cli backend) first
    try:
        text = await asyncio.to_thread(ch.read, url)
        if text and len(text.strip()) > 80:
            return text
    except Exception as e:
        raise HTTPException(502, f"rdt-cli failed: {e}")

    raise HTTPException(502, "Reddit fetch returned empty content")


async def _fetch_twitter(url: str) -> str:
    ch = _twitter()
    if ch is None:
        raise HTTPException(503, "Twitter channel not installed")
    try:
        text = await asyncio.to_thread(ch.read, url)
        if text and len(text.strip()) > 50:
            return text
        raise HTTPException(502, "Twitter fetch returned empty content")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Twitter fetch failed: {e}")


def _fetch_jina(url: str) -> str:
    """Jina Reader fallback (same as hermes-agent fetcher.ts)."""
    jina_url = f"https://r.jina.ai/{url}"
    headers = {
        "User-Agent": "fetcher-service/0.1",
        "Accept": "text/plain",
        "X-Target-Selector": "article, main, [role='main']",
    }
    if JINA_API_KEY:
        headers["Authorization"] = f"Bearer {JINA_API_KEY}"
    try:
        req = urllib.request.Request(jina_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")[:8000]
    except Exception as e:
        raise HTTPException(502, f"Jina fetch failed: {e}") from e
