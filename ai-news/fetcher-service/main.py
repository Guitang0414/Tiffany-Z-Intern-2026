"""
fetcher-service — CLI wrapper for Reddit/Twitter full-text fetch.

Backend routing:
  Reddit local (Mac):  opencli reddit read <url>   (reuses browser login)
  Reddit server (OVH): rdt read <url>              (cookie-file auth)
  Twitter:             opencli twitter read <url>  (future)
  Web fallback:        Jina Reader

POST /fetch   {url, platform}  → {text, platform}
GET  /health                   → {status}
GET  /check?platform=reddit    → {platform, status, backend, message}

hermes-agent (network_mode: host) calls this at http://localhost:8081.
Reddit auth on OVH: rsync ~/.config/rdt-cli/ to /home/ubuntu/fetcher-auth/rdt-cli/ then
bind-mount /home/ubuntu/fetcher-auth:/root/.config (see DEPLOY.md §fetcher-service).
"""
import asyncio
import os
import shutil
import subprocess
import urllib.request
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

JINA_API_KEY = os.environ.get("JINA_API_KEY", "")


# ---- backend detection ----

def _have_opencli() -> bool:
    return shutil.which("opencli") is not None


def _have_rdt() -> bool:
    return shutil.which("rdt") is not None


# ---- request model ----

class FetchRequest(BaseModel):
    url: str
    platform: Literal["reddit", "twitter", "web"] = "web"


# ---- endpoints ----

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/check")
def check(platform: str = "reddit"):
    if platform == "reddit":
        if _have_opencli():
            return {"platform": "reddit", "status": "ok", "backend": "opencli",
                    "message": "opencli available (reuses browser session)"}
        if _have_rdt():
            # Quick auth check
            r = subprocess.run(["rdt", "status", "--json"],
                               capture_output=True, text=True, timeout=10)
            import json
            try:
                data = json.loads(r.stdout or "")
                authed = data.get("data", {}).get("authenticated", False)
                user = data.get("data", {}).get("username", "")
            except Exception:
                authed, user = False, ""
            if authed:
                return {"platform": "reddit", "status": "ok", "backend": "rdt",
                        "message": f"rdt-cli authenticated as {user}"}
            return {"platform": "reddit", "status": "warn", "backend": "rdt",
                    "message": "rdt-cli installed but not authenticated (run rdt login)"}
        return {"platform": "reddit", "status": "error",
                "message": "no Reddit backend found (install opencli or rdt-cli)"}

    return {"platform": platform, "status": "unknown", "message": "not checked"}


@app.post("/fetch")
async def fetch(req: FetchRequest):
    if req.platform == "reddit":
        text = await asyncio.to_thread(_fetch_reddit_sync, req.url)
    elif req.platform == "twitter":
        text = await asyncio.to_thread(_fetch_twitter_sync, req.url)
    else:
        text = _fetch_jina(req.url)

    if not text or len(text.strip()) < 80:
        raise HTTPException(502, "fetch returned empty or too-thin content")

    return {"text": text[:8000], "platform": req.platform}


# ---- sync fetch implementations ----

def _fetch_reddit_sync(url: str) -> str:
    # Prefer opencli (desktop: reuses Chrome session, no auth setup needed)
    if _have_opencli():
        return _opencli_reddit_read(url)
    # Fall back to rdt-cli (server: cookie-file auth)
    if _have_rdt():
        return _rdt_read(url)
    raise HTTPException(503, "no Reddit backend — install opencli or rdt-cli")


def _opencli_reddit_read(url: str) -> str:
    try:
        r = subprocess.run(
            ["opencli", "reddit", "read", url],
            capture_output=True, text=True, timeout=30
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "opencli timed out")
    if r.returncode != 0:
        raise HTTPException(502, f"opencli exit {r.returncode}: {(r.stderr or r.stdout or '').strip()[:200]}")
    out = (r.stdout or "").strip()
    if not out:
        raise HTTPException(502, "opencli returned empty output")
    return out


def _rdt_read(url: str) -> str:
    # rdt-cli interface: `rdt read <url>` or `rdt post <url>`
    # Try both command forms (rdt-cli versions differ)
    for cmd in [["rdt", "read", url], ["rdt", "post", url]]:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "rdt-cli timed out")
        if r.returncode == 0 and (r.stdout or "").strip():
            return (r.stdout or "").strip()

    raise HTTPException(502, f"rdt-cli failed for {url}")


def _fetch_twitter_sync(url: str) -> str:
    if _have_opencli():
        try:
            r = subprocess.run(
                ["opencli", "twitter", "read", url],
                capture_output=True, text=True, timeout=30
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "opencli timed out")
        if r.returncode == 0 and (r.stdout or "").strip():
            return (r.stdout or "").strip()
    raise HTTPException(503, "Twitter fetch not available")


def _fetch_jina(url: str) -> str:
    """Jina Reader fallback — same behaviour as hermes-agent fetcher.ts."""
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
