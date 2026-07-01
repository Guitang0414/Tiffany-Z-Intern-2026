# 部署 Runbook — ai-news

OVH VPS + Dokploy + Traefik。最後更新：2026-06-30。

自動部署：push `main` 分支 → Dokploy GitHub webhook 觸發 rebuild。
日常開發在 `dev` 分支，功能完成後 PR → main。

---

## 目錄

1. [Directus CMS 首次部署](#1-directus-cms-首次部署)
2. [hermes-agent 環境變量](#2-hermes-agent-環境變量)
3. [fetcher-service — Reddit Auth 設置](#3-fetcher-service--reddit-auth-設置)
4. [fetch-relay — 住宅 IP 節點](#4-fetch-relay--住宅-ip-節點)
5. [Tailscale SSH 設置](#5-tailscale-ssh-設置)
6. [日常維運](#6-日常維運)

---

## 1. Directus CMS 首次部署

### 1.1 在 Dokploy 創建 Compose service

- Project：`ai-news`
- 類型：**Compose**
- Source：本倉庫 git，分支 `main`
- **Compose Path**：`ai-news/docker-compose.prod.yml`

### 1.2 環境變量（Dokploy → Environment）

```
# Directus
DIRECTUS_KEY=<openssl rand -base64 32>
DIRECTUS_SECRET=<openssl rand -base64 32>
PUBLIC_URL=https://cms.epochtimesnw.com
POSTGRES_USER=directus
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=directus
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
ARTICLES_SERVICE_ROLE_IDS=          # 第 1.5 步填

# Authentik OIDC
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_ISSUER_URL=...
DIRECTUS_DEFAULT_ROLE_ID=...        # editor role UUID

# hermes-agent（見第 2 節）
HERMES_DIRECTUS_URL=https://cms.epochtimesnw.com
HERMES_DIRECTUS_TOKEN=...
GATEWAY_BASE_URL=http://<tailscale-ip>:8317/v1
GATEWAY_API_KEY=...
JINA_API_KEY=jina_...
RELAY_URLS=http://100.97.116.16:8082   # 見第 4 節
```

### 1.3 配域名

- Host：`cms.epochtimesnw.com`，Container Port：**8055**，HTTPS 開

### 1.4 部署並套用 Schema

```bash
# 首次部署後跑 bootstrap（在能訪問公網的機器上）
DIRECTUS_URL=https://cms.epochtimesnw.com ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  node bootstrap/schema.mjs
node bootstrap/add-m2m.mjs
node bootstrap/permissions.mjs   # 輸出 SERVICE ROLE ID
```

### 1.5 填入 SERVICE ROLE ID

把 `permissions.mjs` 輸出的 UUID 填回 Dokploy 的 `ARTICLES_SERVICE_ROLE_IDS`，然後重新 Deploy。

### 1.6 驗收

跑 `ACCEPTANCE.md` 裡的行為測試（狀態機、去重、immutable field）。

---

## 2. hermes-agent 環境變量

hermes-agent 用 `network_mode: host`（需要 Tailscale 訪問 Claude 閘道）。

| 變量 | 說明 | 示例 |
|------|------|------|
| `HERMES_DIRECTUS_URL` | Directus 公網域名 | `https://cms.epochtimesnw.com` |
| `HERMES_DIRECTUS_TOKEN` | service account static token | 在 Directus 後台生成 |
| `GATEWAY_BASE_URL` | Claude 閘道 Tailscale 地址 | `http://100.97.116.16:8317/v1` |
| `GATEWAY_API_KEY` | 閘道 API key | |
| `MODEL_DEEP` | Lane A 模型 | `claude-sonnet-4-6` |
| `MODEL_SHORT` | Lane B 模型 | `claude-haiku-4-5-20251001` |
| `JINA_API_KEY` | Jina Reader key（減少封鎖） | `jina_...` |
| `FETCHER_URL` | fetcher-service 地址 | `http://localhost:8081`（固定） |
| `RELAY_URLS` | 住宅 relay 節點（逗號分隔） | `http://100.97.116.16:8082` |
| `DAILY_TOKEN_BUDGET` | 每日 Claude token 上限 | `500000` |
| `MAX_PER_RUN` | 每次 cron 最多發布篇數 | `8` |
| `CRON_HIGH` | Lane A 觸發頻率 | `*/10 * * * *` |
| `CRON_LOW` | Lane B 觸發頻率 | `0 8 * * *` |

---

## 3. fetcher-service — Reddit Auth 設置

fetcher-service 是給 hermes-agent 取 Reddit 全文用的 Python 服務，同樣用 `network_mode: host`。

### 3.1 後端選擇

| 環境 | 後端 | 說明 |
|------|------|------|
| 本地 Mac | `opencli` | 複用 Chrome 登錄態，安裝 Chrome 擴充即可 |
| OVH 容器 | `rdt-cli` | Cookie 文件 auth，無頭運行 |

### 3.2 本地 Mac 設置（一次性）

```bash
# 安裝 agent-reach 和 rdt-cli
pip3 install "git+https://github.com/Panniantong/Agent-Reach.git" --break-system-packages
python3 -m agent_reach.cli install --channels=reddit

# 安裝 OpenCLI Chrome 擴充（手動，用於本地測試）
# 下載：https://github.com/jackwener/opencli/releases → opencli-extension-*.zip
# Chrome → chrome://extensions/ → 開發者模式 → 載入未封裝

# 驗證
opencli doctor
```

### 3.3 OVH Reddit Auth（一次性，本地操作）

```bash
# 在本地 Mac 上：從 Chrome 自動提取 Reddit session
export PATH="$PATH:/Users/$(whoami)/.local/bin"
pipx install "git+https://github.com/public-clis/rdt-cli.git@5e4fb3720d5c174e976cd425ccc3b879d52cac66"
rdt login         # 輸出「Already authenticated」即成功
rdt status --json # 確認 authenticated: true, username: Guitang

# 同步 credential 到 OVH（Tailscale SSH）
ssh ubuntu@ovh-prod-eet "mkdir -p /home/ubuntu/fetcher-auth/rdt-cli"
rsync -avz ~/.config/rdt-cli/ ubuntu@ovh-prod-eet:/home/ubuntu/fetcher-auth/rdt-cli/
```

### 3.4 Auth 路徑說明

OVH 上的 bind mount：
```
主機路徑: /home/ubuntu/fetcher-auth/rdt-cli/credential.json
容器路徑: /root/.config/rdt-cli/credential.json
```

Reddit session cookie 有效期約 1 年。到期後重跑 3.3。

### 3.5 驗證

```bash
# 在 OVH 上
curl http://localhost:8081/health
curl "http://localhost:8081/check?platform=reddit"
```

### 3.6 Reddit 封 OVH IP — SOCKS5 代理走住宅 IP

Credential 沒問題也會遇到 `authenticated: false, error: "Access forbidden: Resource"`——
Reddit 在 API 層直接封鎖了 OVH 機房 IP（跟 South Seattle Emerald / PSBJ 被封是同一類問題）。
同一份 credential 在本地 Mac 測試是通的，證明不是帳號問題。

解法：`rdt-cli` 底層用 `httpx.Client()`（`trust_env=True`），會自動讀 `HTTPS_PROXY` 環境變量，
不用改它的代碼。讓 fetcher-service 只把 Reddit 請求透過 SSH SOCKS5 隧道經 Lenovo 的住宅 IP
出去：

**前提：Tailscale ACL 要開一條 OVH → Lenovo 的 SSH 規則**（Lenovo 是個人設備，不是 tag，
需要先在 Tailscale admin → Machines 把 Lenovo 打上一個 tag，比如 `tag:relay`，`tagOwners`
裡也要加這個 tag，然後 ACL `ssh` 陣列裡加）：
```json
{
  "action": "accept",
  "src": ["tag:prod"],
  "dst": ["tag:relay"],
  "users": ["root"]
}
```
（`dst` 不接受裸 IP / MagicDNS 主機名，只認 tag/group/身份，這是踩過的坑。）

**OVH host 上建常駐 SOCKS5 隧道**（systemd，不是在容器裡跑）：
```bash
sudo tee /etc/systemd/system/reddit-socks-tunnel.service > /dev/null <<'EOF'
[Unit]
Description=SOCKS5 tunnel to Lenovo residential IP (for fetcher-service Reddit reads)
After=network.target tailscaled.service
Wants=tailscaled.service

[Service]
ExecStart=/usr/bin/ssh -N -D 127.0.0.1:1080 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=accept-new root@seattle-eet-lenovo-product
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now reddit-socks-tunnel.service
sudo systemctl status reddit-socks-tunnel.service --no-pager
```

`fetcher-service` 用 `network_mode: host`，容器內直接能打到 `127.0.0.1:1080`，不用額外配網路。
`main.py` 只給 `rdt` 這個 subprocess 注入 `HTTPS_PROXY=socks5h://127.0.0.1:1080`（見
`REDDIT_PROXY_URL` 環境變量，預設就是這個地址），不影響 Jina/relay 的請求。

驗證：
```bash
curl "http://localhost:8081/check?platform=reddit"   # authenticated 應變 true
```

---

## 4. fetch-relay — 住宅 IP 節點

當 Jina Reader 被目標網站封鎖時，fetcher-service 自動 fallback 到住宅 IP relay 節點（通過 Tailscale tailnet 訪問）。

### 4.1 現有節點

| 主機名 | Tailscale IP | 狀態 |
|--------|-------------|------|
| `seattle-eet-lenovo-product` | 100.97.116.16 | ✅ 運行中 |

### 4.2 在新機器上安裝 relay（Linux + Tailscale）

```bash
# 確保機器已加入 Tailscale tailnet
tailscale ip -4   # 確認有 IP

# 複製 relay.py 和 install.sh 到機器上，然後：
sudo bash ai-news/fetch-relay/install.sh
```

install.sh 會：
1. 把 `relay.py` 裝到 `/opt/fetch-relay/`
2. 創建 systemd 服務，開機自啟
3. 只監聽 Tailscale IP（公網不可達）

### 4.3 添加新節點到 fetcher-service

在 Dokploy 的 `RELAY_URLS` 環境變量裡追加（逗號分隔）：

```
RELAY_URLS=http://100.97.116.16:8082,http://<新節點-tailscale-hostname>:8082
```

也可以用 Tailscale hostname 代替 IP（hostname 更穩定）：

```
RELAY_URLS=http://seattle-eet-lenovo-product:8082,http://friend1-laptop:8082
```

### 4.4 Fallback 順序

```
hermes-agent 請求文章全文
  → fetcher-service
      1. Jina Reader（有 key，OVH Datacenter IP）
      2. RELAY_URLS[0]（Lenovo，西雅圖住宅 IP）
      3. RELAY_URLS[1]（朋友節點）
      4. ...
      → 全部失敗 → 502，pipeline 記錄 fetch-fail 等下輪重試
```

---

## 5. Tailscale SSH 設置

### 5.1 ACL 配置

在 `https://login.tailscale.com/admin/acls` 的 `ssh` 區塊：

```json
"ssh": [
  {
    "action": "accept",
    "src": ["autogroup:member"],
    "dst": ["tag:prod"],
    "users": ["root", "ubuntu"]
  }
]
```

- OVH 的 Tailscale tag 是 `tag:prod`
- `autogroup:member` = tailnet 所有成員設備

### 5.2 常用連接

```bash
ssh ubuntu@ovh-prod-eet          # OVH VPS
ssh root@seattle-eet-lenovo-product   # Lenovo 桌機
```

---

## 6. 日常維運

### 查看日誌

```bash
ssh ubuntu@ovh-prod-eet
docker logs ainews-directus-c7rvvp-hermes-agent-1 --tail 50 -f
docker logs ainews-directus-c7rvvp-directus-1 --tail 50 -f
```

### 手動觸發 hermes-agent

```bash
docker exec ainews-directus-c7rvvp-hermes-agent-1 node dist/index.js once
```

### fetcher-service 診斷

```bash
curl http://localhost:8081/health
curl "http://localhost:8081/check?platform=reddit"
```

### Reddit Cookie 過期後刷新

```bash
# 本地 Mac
rdt login
rsync -avz ~/.config/rdt-cli/ ubuntu@ovh-prod-eet:/home/ubuntu/fetcher-auth/rdt-cli/
ssh ubuntu@ovh-prod-eet "docker restart ainews-directus-c7rvvp-fetcher-service-1 2>/dev/null || true"
```

### fetch-relay 狀態檢查

```bash
# 從 OVH 確認各節點可達
curl http://100.97.116.16:8082/health
# curl http://<其他節點>:8082/health
```

### Schema 更新

```bash
# 本地生成快照
DIRECTUS_URL=https://cms.epochtimesnw.com ADMIN_EMAIL=... ADMIN_PASSWORD=... \
  npx directus schema snapshot snapshots/$(date +%Y%m%d)-schema.yaml

# 套用到生產
docker exec <directus-container> npx directus schema apply --yes /path/snapshot.yaml
```
