#!/usr/bin/env bash
# fetch-relay installer — runs on Linux machines in Tailscale tailnet.
# One-command setup: sudo bash install.sh
# Installs relay.py as a systemd service that starts on boot.

set -e

INSTALL_DIR="/opt/fetch-relay"
SERVICE_NAME="fetch-relay"

echo "=== fetch-relay installer ==="

# Check Tailscale
if ! command -v tailscale &>/dev/null; then
  echo "ERROR: Tailscale is not installed. Install it first:"
  echo "  curl -fsSL https://tailscale.com/install.sh | sh"
  exit 1
fi

TS_IP=$(tailscale ip -4 2>/dev/null || echo "")
if [ -z "$TS_IP" ]; then
  echo "ERROR: Tailscale is installed but not connected. Run: sudo tailscale up"
  exit 1
fi
echo "✓ Tailscale IP: $TS_IP"

# Install relay.py
mkdir -p "$INSTALL_DIR"
cp "$(dirname "$0")/relay.py" "$INSTALL_DIR/relay.py"
chmod +x "$INSTALL_DIR/relay.py"
echo "✓ Installed to $INSTALL_DIR/relay.py"

# Create systemd service
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=fetch-relay residential IP proxy (epochtimesnw.com)
After=network.target tailscaled.service
Wants=tailscaled.service

[Service]
ExecStart=/usr/bin/python3 $INSTALL_DIR/relay.py
Restart=always
RestartSec=10
User=nobody
Environment=RELAY_PORT=8082

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "✓ Service running on $TS_IP:8082"
  echo ""
  echo "Tell the admin your Tailscale hostname:"
  echo "  $(tailscale status --self 2>/dev/null | head -1 | awk '{print $2}' || hostname)"
else
  echo "ERROR: service failed to start. Check: journalctl -u $SERVICE_NAME -n 20"
  exit 1
fi
