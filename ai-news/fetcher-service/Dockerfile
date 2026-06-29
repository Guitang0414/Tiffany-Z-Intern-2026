FROM python:3.11-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install upstream tools (rdt-cli for Reddit, etc.) via Agent-Reach's installer.
# --env=server skips desktop/browser tools. Failures are non-fatal (|| true).
RUN python -m agent_reach.cli install --env=server || true

COPY main.py .

# Listen on loopback only — hermes-agent (network_mode: host) reaches this at localhost:8081.
# Nothing external can reach it; no auth token needed on this port.
EXPOSE 8081

CMD ["uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8081", "--log-level", "info"]
