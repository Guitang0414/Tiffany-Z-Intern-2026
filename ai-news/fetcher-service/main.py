"""
fetcher-service — CLI wrapper for Reddit/Twitter full-text fetch + residential relay fallback.

Backend routing:
  Reddit local (Mac):  opencli reddit read <url>   (reuses browser login)
  Reddit server (OVH): rdt read <url>              (cookie-file auth, via SOCKS5 proxy —
                       Reddit blocks OVH's datacenter IP at the API layer; rdt-cli's httpx
                       client is routed through reddit-socks-tunnel.service on the OVH host,
                       an SSH -D tunnel to a residential IP. See REDDIT_PROXY_URL below.)
  Twitter:             opencli twitter read <url>  (future)
  Web:                 1. Jina Reader (OVH IP, has API key)
                       2. Residential relay nodes (via Tailscale, RELAY_URLS env)

POST /fetch   {url, platform}  → {text, platform}
GET  /health                   → {status, relays}
GET  /check?platform=reddit    → {platform, status, backend, message}

hermes-agent (network_mode: host) calls this at http://localhost:8081.
Reddit auth: bind-mount /home/ubuntu/fetcher-auth:/root/.config (see DEPLOY.md).
Relay nodes: set RELAY_URLS=http://host1:8082,http://host2:8082 (Tailscale hostnames/IPs).
"""
import asyncio
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

JINA_API_KEY = os.environ.get("JINA_API_KEY", "")

# Comma-separated list of residential relay endpoints (Tailscale hostnames or IPs).
# Example: http://seattle-eet-lenovo-product:8082,http://friend1-laptop:8082
_RELAY_URLS: list[str] = [
    u.strip().rstrip("/")
    for u in os.environ.get("RELAY_URLS", "").split(",")
    if u.strip()
]

# SOCKS5 proxy for rdt-cli only (Reddit blocks OVH's datacenter IP at the API layer).
# Tunnels through reddit-socks-tunnel.service on the OVH host (SSH -D to Lenovo's
# residential IP); rdt-cli's httpx client picks this up via HTTPS_PROXY (trust_env=True).
# Set to "" to disable (rdt-cli then calls Reddit directly from OVH's IP).
_REDDIT_PROXY = os.environ.get("REDDIT_PROXY_URL", "socks5h://127.0.0.1:1080")


# ---- backend detection ----

def _have_opencli() -> bool:
    return shutil.which("opencli") is not None


def _have_rdt() -> bool:
    return shutil.which("rdt") is not None


def _rdt_env() -> dict[str, str]:
    """rdt-cli's httpx client is trust_env=True, so it picks up HTTPS_PROXY automatically.
    Scoped to this subprocess only — Jina/relay requests elsewhere in this file are unaffected."""
    env = dict(os.environ)
    if _REDDIT_PROXY:
        env["HTTPS_PROXY"] = _REDDIT_PROXY
        env["HTTP_PROXY"] = _REDDIT_PROXY
    return env


# ---- request model ----

class FetchRequest(BaseModel):
    url: str
    platform: Literal["reddit", "twitter", "web"] = "web"


# ---- endpoints ----

@app.get("/health")
def health():
    return {"status": "ok", "relays": len(_RELAY_URLS), "relay_hosts": _RELAY_URLS}


@app.get("/check")
def check(platform: str = "reddit"):
    if platform == "reddit":
        if _have_opencli():
            return {"platform": "reddit", "status": "ok", "backend": "opencli",
                    "message": "opencli available (reuses browser session)"}
        if _have_rdt():
            # Quick auth check
            r = subprocess.run(["rdt", "status", "--json"],
                               capture_output=True, text=True, timeout=10, env=_rdt_env())
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
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=_rdt_env())
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
    """Jina Reader — tries Jina first, then residential relay nodes on failure."""
    # 1. Jina Reader
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
            text = resp.read().decode("utf-8")[:8000]
        if len(text.strip()) >= 200:
            return text
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise HTTPException(429, "Jina rate-limited") from e
        # other HTTP errors → try relays
    except Exception:
        pass  # network error → try relays

    # 2. Residential relay nodes (Tailscale, tried in order)
    return _fetch_via_relay(url)


def _fetch_via_relay(url: str) -> str:
    """Try each residential relay in order; raise 502 if all fail."""
    if not _RELAY_URLS:
        raise HTTPException(502, f"Jina failed and no relay nodes configured (set RELAY_URLS)")

    last_err = ""
    for relay in _RELAY_URLS:
        try:
            payload = f'{{"url": "{url}"}}'.encode()
            req = urllib.request.Request(
                f"{relay}/fetch",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=35) as resp:
                data = __import__("json").loads(resp.read())
            text = data.get("text", "")
            if text and len(text.strip()) >= 200:
                return text
            last_err = f"relay {relay} returned thin content"
        except Exception as e:
            last_err = f"relay {relay} error: {e}"
            continue

    raise HTTPException(502, f"all relays failed — last error: {last_err}")
