#!/usr/bin/env python3
"""
fetch-relay — residential IP fetch proxy for epochtimesnw.com news pipeline.

Runs on always-on machines behind residential ISP (Tailscale tailnet only).
OVH's fetcher-service calls this when Jina Reader is blocked by a site.

Endpoints:
  GET  /health          → {status, hostname}
  POST /fetch {url}     → {text}   (HTML stripped to clean text)

Security: listens ONLY on the Tailscale interface IP — never exposed to public internet.
Zero external dependencies (stdlib only).

Setup: see install.sh in this directory.
"""
import json
import os
import socket
import subprocess
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from html.parser import HTMLParser

PORT = int(os.environ.get("RELAY_PORT", 8082))

# Mimic a real browser so sites don't block us
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _tailscale_ip() -> str:
    """Return this machine's Tailscale IPv4 address, or 0.0.0.0 as fallback."""
    try:
        r = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=5)
        ip = r.stdout.strip()
        if ip:
            return ip
    except Exception:
        pass
    return "0.0.0.0"


# ---- minimal HTML → clean text (no dependencies) ----

class _StripHTML(HTMLParser):
    _SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "noscript"}
    _BLOCK_TAGS = {"p", "div", "br", "h1", "h2", "h3", "h4", "li", "tr", "blockquote"}

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._depth = 0   # nesting depth inside skip tags

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP_TAGS:
            self._depth += 1
        if tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP_TAGS and self._depth:
            self._depth -= 1
        if tag in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data):
        if self._depth == 0:
            self._parts.append(data)

    def text(self) -> str:
        raw = " ".join("".join(self._parts).split())
        return raw[:9000]


def _html_to_text(html: str) -> str:
    p = _StripHTML()
    try:
        p.feed(html)
        return p.text()
    except Exception:
        return html[:9000]


# ---- HTTP handler ----

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default logging
        pass

    def _send(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok", "hostname": socket.gethostname()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/fetch":
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid JSON"})
            return

        url = (body.get("url") or "").strip()
        if not url or not url.startswith(("http://", "https://")):
            self._send(400, {"error": "valid url required"})
            return

        extra_headers = body.get("headers") or {}
        headers = {**_HEADERS, **extra_headers}

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            text = _html_to_text(raw) if "<html" in raw[:500].lower() else raw[:9000]
            if len(text.strip()) < 100:
                self._send(502, {"error": "fetched content too thin"})
                return
            self._send(200, {"text": text})
        except urllib.error.HTTPError as e:
            self._send(502, {"error": f"upstream HTTP {e.code} for {url}"})
        except urllib.error.URLError as e:
            self._send(502, {"error": f"network error: {e.reason}"})
        except Exception as e:
            self._send(502, {"error": str(e)})


if __name__ == "__main__":
    host = _tailscale_ip()
    server = HTTPServer((host, PORT), Handler)
    print(f"[fetch-relay] listening on {host}:{PORT}  (tailscale-only)")
    print(f"[fetch-relay] hostname: {socket.gethostname()}")
    server.serve_forever()
