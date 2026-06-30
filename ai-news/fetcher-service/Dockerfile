FROM python:3.11-slim

RUN apt-get update && apt-get install -y git curl pipx && rm -rf /var/lib/apt/lists/*

# Make pipx-installed tools available on PATH
ENV PIPX_HOME=/opt/pipx
ENV PIPX_BIN_DIR=/usr/local/bin

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install rdt-cli from pinned git commit (PyPI is behind, per Agent-Reach docs).
# This is the server-side Reddit backend — OpenCLI requires a browser and won't work here.
# Auth: bind-mount /root/.config/rdt-cli/credential.json (see DEPLOY.md §fetcher-service).
RUN pipx install \
    "git+https://github.com/public-clis/rdt-cli.git@5e4fb3720d5c174e976cd425ccc3b879d52cac66" \
    || echo "⚠️  rdt-cli install failed — Reddit will return 503 until fixed"

COPY main.py .

# Listen on loopback only — hermes-agent (network_mode: host) reaches this at localhost:8081.
EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8081", "--log-level", "info"]
