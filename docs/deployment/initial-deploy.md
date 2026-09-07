# Initial Production Deployment Checklist: Fresh Ubuntu/Debian VPS

This checklist provides an exhaustive, step-by-step procedure for deploying the **Dograh Voice AI Platform** from scratch on a clean Ubuntu or Debian virtual private server (VPS). 

This guide implements a **zero-source deployment model**: proprietary application code (`api/`, `ui/`, `pipecat/`) and private Git repository metadata (`.git/`) are **never copied to the server**. Instead, the server receives only runtime orchestration files and pulls production Docker images built by CI/CD directly from Docker Hub.

---

## Architecture Overview & Runtime Model

Before deploying, familiarize yourself with the Dograh service topology:

| Service | Container Name | Profile | Ports (Host:Container) | Function & Security Boundaries |
|---------|----------------|---------|------------------------|--------------------------------|
| **Nginx** | `nginx_https` | `remote` | `80:80`, `443:443` | Reverse proxy, SSL termination, Let's Encrypt ACME challenge webroot, static asset routing, and WebSocket streaming load balancer. |
| **Coturn** | `coturn` | `remote` | `3478:3478` (TCP/UDP), `5349:5349` (TCP/UDP), `49152-49200` (UDP) | WebRTC STUN/TURN signaling and media relay server. |
| **API** | (dynamic) | default | `8000:8000` (Internal) | FastAPI application with Uvicorn processes and ARQ task workers. Automatically runs Alembic migrations on startup. **Must remain internal.** |
| **UI** | (dynamic) | default | `3010:3010` (Internal) | Next.js 15 standalone frontend web interface. |
| **PostgreSQL** | (dynamic) | default | `5432:5432` (Internal) | PostgreSQL 17 with `pgvector` extension for vector embeddings and relational application data. |
| **Redis** | (dynamic) | default | `6379:6379` (Internal) | Redis 7 cache and ARQ asynchronous task queue. |
| **MinIO** | `minio` | default | `127.0.0.1:9000`, `127.0.0.1:9001` | S3-compatible object storage for call audio recordings and voice files. |
| **Dograh Init** | `dograh_init` | `remote` | None (Ephemeral) | Renders Nginx (`default.conf`) and Coturn (`turnserver.conf`) from templates at boot before dependent services start. |

---

## Step 1: Server Prerequisites & Hardware Sizing

### 1.1 Operating System
- **Recommended**: Ubuntu 24.04 LTS or Ubuntu 22.04 LTS (x86_64 / amd64 or arm64).
- **Supported**: Debian 12 (Bookworm).

Verify your Linux release on the server:
```bash
lsb_release -a
uname -m
```

### 1.2 Hardware Sizing Guidelines
Dograh orchestrates real-time audio processing, WebSockets, background task workers, vector databases, and reverse proxies:

- **vCPU**: Minimum **4 vCPUs** (8+ recommended for production workloads handling multiple concurrent calls).
- **RAM**: Minimum **8 GB RAM** (16 GB recommended).
- **Disk Storage**: Minimum **40 GB NVMe / SSD** storage.
- **Network**: Dedicated **static public IPv4 address** with unthrottled UDP bandwidth for WebRTC RTP streaming.

### 1.3 SSH Access & User Privileges
Ensure you have a non-root user with passwordless `sudo` privileges configured on the VPS:
```bash
# Add user to sudoers if not already present
sudo usermod -aG sudo $USER
```

Verify SSH connectivity from your local workstation:
```bash
ssh -i ~/.ssh/id_rsa <username>@<SERVER_IP>
```

---

## Step 2: UFW Firewall & Cloud Security Group Configuration

Dograh requires explicit port openings for web traffic and WebRTC NAT traversal, while database and application ports **must be kept strictly internal**.

### 2.1 Complete Network Port Matrix

| Port | Protocol | Exposure | Service | Justification |
|------|----------|----------|---------|---------------|
| **22** | TCP | **Public** | SSH | Remote server administration and CI/CD automated deployment. |
| **80** | TCP | **Public** | Nginx (HTTP) | Let's Encrypt HTTP-01 webroot challenges and automatic 301 redirect to HTTPS. |
| **443** | TCP | **Public** | Nginx (HTTPS) | Web interface, REST API (`/api/v1/`), WebSockets, and MinIO audio proxy (`/voice-audio/`). |
| **3478** | TCP + UDP | **Public** | Coturn STUN/TURN | Standard listener port for WebRTC NAT traversal. |
| **5349** | TCP + UDP | **Public** | Coturn TURNS | Secure TLS/DTLS listener port for WebRTC NAT traversal over encrypted channels. |
| **49152:49200** | UDP | **Public** | Coturn Relay Range | Ephemeral UDP relay range for actual audio/RTP packet streaming. **WebRTC audio will fail without this range!** |
| **8000** | TCP | **INTERNAL ONLY** | FastAPI (Uvicorn) | **CRITICAL SECURITY RISK IF EXPOSED.** Must be reached only via Nginx. Exposing port 8000 bypasses TLS, exposes internal endpoints, and allows header spoofing. |
| **3010** | TCP | **INTERNAL ONLY** | Next.js Frontend | Reverse proxied internally through Nginx. |
| **5432** | TCP | **INTERNAL ONLY** | PostgreSQL | Container network access only. Never expose to public internet. |
| **6379** | TCP | **INTERNAL ONLY** | Redis | Container network access only. Never expose to public internet. |
| **9000 / 9001** | TCP | **INTERNAL ONLY** | MinIO S3 / Console | Explicitly bound to `127.0.0.1`. Proxied externally via Nginx `/voice-audio/`. |

### 2.2 Configure UFW (Uncomplicated Firewall)

Run the following commands on your VPS to configure the firewall:

```bash
# Set default traffic policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH administration
sudo ufw allow 22/tcp comment 'SSH'

# Allow Web & HTTPS traffic
sudo ufw allow 80/tcp comment 'Nginx HTTP / ACME Challenge'
sudo ufw allow 443/tcp comment 'Nginx HTTPS'

# Allow Coturn STUN/TURN signaling (TCP & UDP)
sudo ufw allow 3478/tcp comment 'Coturn STUN/TURN TCP'
sudo ufw allow 3478/udp comment 'Coturn STUN/TURN UDP'
sudo ufw allow 5349/tcp comment 'Coturn TURNS TLS'
sudo ufw allow 5349/udp comment 'Coturn TURNS DTLS'

# Allow Coturn WebRTC media relay port range (UDP)
sudo ufw allow 49152:49200/udp comment 'Coturn WebRTC Media Relay'

# Enable the firewall
sudo ufw --force enable

# Verify active firewall status
sudo ufw status verbose
```

> **Important Security Warning regarding Docker & UFW**:  
> By default, Docker modifies `iptables` directly to expose mapped container ports, which can bypass UFW rules on Linux. Port 8000 in `docker-compose.yaml` is published for legacy and container bridging reasons. In production, **always ensure that your cloud provider's external security group (AWS Security Group, GCP Firewall, Hetzner Firewall, DigitalOcean Cloud Firewall) also strictly blocks port 8000, 5432, 6379, and 3010 from public inbound traffic.**

---

## Step 3: Install Docker Engine & Docker Compose Plugin (v2)

Install the latest official Docker Engine and Docker Compose v2 plugin from the official Docker apt repository (do **not** use `apt-get install docker.io` or the legacy python `docker-compose`).

```bash
# 1. Update apt package index and install required utilities
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 2. Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Add the Docker repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker Engine, CLI, Containerd, and Compose v2 plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Enable and start Docker service
sudo systemctl enable --now docker

# 6. Add your current user to the docker group (allows running docker without sudo)
sudo usermod -aG docker "$USER"
```

*Note: If you are running as a non-root user, log out and log back in, or run `newgrp docker` to apply the group membership.*

### Verify Docker Installation:
```bash
docker --version
# Output should show: Docker version 26.x or 27.x

docker compose version
# Output should show: Docker Compose version v2.x.x
```

---

## Step 4: Transfer Deployment Files to the VPS (Zero Git Remote Exposure)

To protect proprietary source code and prevent storing private Git credentials or commit history on the server, **do not clone your private Git repository onto the VPS**. Only transfer the runtime orchestration files.

### 4.1 Minimal Required Files Checklist

The server requires only these files:
```
~/dograh/
├── docker-compose.yaml                 # Base orchestration stack
├── docker-compose.override.yaml        # Overrides api/ui to Docker Hub images
├── remote_up.sh                        # Validated startup wrapper
├── scripts/
│   ├── lib/
│   │   └── setup_common.sh             # Common validation and config library
│   ├── run_dograh_init.sh              # Template renderer entrypoint
│   ├── setup_remote.sh                 # First-time remote setup helper
│   ├── setup_custom_domain.sh          # Custom domain & Certbot automation
│   └── run_migrate.sh                  # Database migration helper
├── deploy/
│   ├── templates/
│   │   ├── nginx.remote.conf.template  # Nginx configuration template
│   │   └── turnserver.remote.conf.template # Coturn configuration template
│   └── .env.production.template        # Production environment template
├── nginx/
│   └── dograh_upstream.conf.template   # Upstream template reference
└── config/
    └── coturn/
        └── turnserver.conf             # Base coturn reference config
```

### 4.2 Transfer Methods

Choose one of the following methods to transfer the files from your local development workstation:

#### Option A: Automated Sync Helper (`deploy/sync_vps.sh`)
If you have the `deploy/sync_vps.sh` helper in your local repository, run:
```bash
# Run from your local repository root:
./deploy/sync_vps.sh <user>@<SERVER_IP> ~/dograh
```

#### Option B: Direct `rsync` over SSH
```bash
# Run from your local repository root:
rsync -avz --exclude='.git*' --exclude='api/' --exclude='ui/' --exclude='pipecat/' --exclude='docs/' --exclude='.agents/' \
  docker-compose.yaml \
  docker-compose.override.yaml \
  remote_up.sh \
  scripts/ \
  deploy/ \
  nginx/ \
  config/ \
  <user>@<SERVER_IP>:~/dograh/

# Ensure executable permissions on scripts on remote VPS:
ssh <user>@<SERVER_IP> "chmod +x ~/dograh/remote_up.sh ~/dograh/scripts/*.sh"
```

#### Option C: Compressed Tar Streaming Pipe (No local/remote rsync needed)
```bash
# Run from your local repository root:
tar -czf - \
  docker-compose.yaml \
  docker-compose.override.yaml \
  remote_up.sh \
  scripts/lib/setup_common.sh \
  scripts/run_dograh_init.sh \
  scripts/setup_remote.sh \
  scripts/setup_custom_domain.sh \
  scripts/run_migrate.sh \
  deploy/templates \
  deploy/.env.production.template \
  nginx \
  config \
| ssh <user>@<SERVER_IP> "mkdir -p ~/dograh && tar -xzf - -C ~/dograh && chmod +x ~/dograh/remote_up.sh ~/dograh/scripts/*.sh"
```

---

## Step 5: Authenticate Docker Hub on the VPS

Because your production images (`dograh-api` and `dograh-ui`) are stored in your Docker Hub repository/organization, the VPS Docker daemon must authenticate to pull them without hitting rate limits or authorization errors.

SSH into your VPS and log in to Docker Hub:

```bash
ssh <user>@<SERVER_IP>
cd ~/dograh

# Option 1: Interactive login
docker login -u "<YOUR_DOCKERHUB_USERNAME>"

# Option 2: Automated login with Personal Access Token (PAT)
echo "<YOUR_DOCKERHUB_PAT_TOKEN>" | docker login -u "<YOUR_DOCKERHUB_USERNAME>" --password-stdin
```

Verify that credentials are saved:
```bash
cat ~/.docker/config.json
# Should show "auths": { "https://index.docker.io/v1/": { ... } }
```

---

## Step 6: Create and Configure the Production `.env` File

Navigate to the deployment directory on your VPS:
```bash
cd ~/dograh
```

### 6.1 Generate Cryptographic Secrets
Generate 32-byte cryptographically secure random hexadecimal strings for each secret using `openssl`:

```bash
# Generate secrets:
echo "OSS_JWT_SECRET=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
echo "REDIS_PASSWORD=$(openssl rand -hex 32)"
echo "MINIO_ROOT_PASSWORD=$(openssl rand -hex 32)"
echo "TURN_SECRET=$(openssl rand -hex 32)"
```

### 6.2 Complete Production `.env` Template
Create `.env` using your generated secrets. Substitute `<SERVER_IP>` with your server's public IPv4 address and `<YOUR_DOCKERHUB_REPO>` with your Docker Hub username or organization:

```dotenv
# ==============================================================================
# Dograh Production Environment Configuration
# File: ~/dograh/.env
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Environment & Network Addressing
# ------------------------------------------------------------------------------
# Deployment mode: production
ENVIRONMENT=production

# Public IPv4 address of this VPS (used for TURN external IP & sslip fallback)
SERVER_IP=203.0.113.10

# Canonical public host. If you don't have a custom domain yet, you can use
# the sslip.io address: 203-0-113-10.sslip.io (dashes instead of dots)
PUBLIC_HOST=203-0-113-10.sslip.io

# Full canonical URL with HTTPS scheme (no trailing slash)
PUBLIC_BASE_URL=https://203-0-113-10.sslip.io

# Docker Hub organization or username where CI/CD pushes production images
DOCKERHUB_REPO=yourdockerhuborg

# ------------------------------------------------------------------------------
# 2. Authentication & Cryptographic Secrets
# ------------------------------------------------------------------------------
# Secret key used to sign and verify user JWT sessions (Mandatory)
# Generate via: openssl rand -hex 32
OSS_JWT_SECRET=4a2f8d39c1b7e5a60429f831d75c8290e2b4f910a3c8e71b2d4f6a8c0e2b4d6f

# Master password for containerized PostgreSQL 17 database
POSTGRES_PASSWORD=7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a

# Password for containerized Redis 7 queue and cache
REDIS_PASSWORD=9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b

# MinIO S3 object storage admin credentials
MINIO_ROOT_USER=dograh_admin
MINIO_ROOT_PASSWORD=1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b

# ------------------------------------------------------------------------------
# 3. WebRTC & Coturn STUN/TURN Configuration
# ------------------------------------------------------------------------------
# Enable internal Coturn server for WebRTC NAT traversal (Mandatory: true)
ENABLE_COTURN=true

# Shared authentication secret for TURN REST API (HMAC-SHA1 authentication)
# Generate via: openssl rand -hex 32
TURN_SECRET=5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d

# Force all WebRTC traffic through TURN relay (false = peer-to-peer preferred)
FORCE_TURN_RELAY=false

# ------------------------------------------------------------------------------
# 4. Scaling, Workers & Application Flags
# ------------------------------------------------------------------------------
# Number of Uvicorn worker processes Nginx load-balances with least_conn.
# Rule of thumb: 2 workers for 4 vCPUs, 4 workers for 8 vCPUs.
FASTAPI_WORKERS=2

# Allow self-registration on the login page (set to false for invite-only)
ENABLE_SIGNUP=true

# PostHog telemetry (set to false to disable anonymous telemetry)
ENABLE_TELEMETRY=true
```

Ensure file permissions prevent unauthorized reading:
```bash
chmod 600 ~/dograh/.env
```

---

## Step 7: First-Time Setup Execution (Bootstrap Certs & Configuration)

You can perform the first-time setup using either the automated setup script or manual commands.

### Option A: Automated Setup Script
When using transferred custom deployment files, run `setup_remote.sh` with `DOGRAH_SKIP_DOWNLOAD=1`. This is **crucial** so the script utilizes your local files instead of downloading the upstream Git repository.

```bash
cd ~/dograh
DOGRAH_SKIP_DOWNLOAD=1 sudo -E ./scripts/setup_remote.sh
```

**Prompts explanation:**
1. **Server IP**: Automatically detects or prompts for `SERVER_IP` (e.g. `203.0.113.10`).
2. **TURN Secret**: Press Enter to preserve the secret in your `.env`.
3. **Deployment Mode**: Choose `1` (prebuilt - pulls images from Docker Hub).
4. **FastAPI Workers**: Enter `2` (or press Enter for default).

The script will:
- Generate initial bootstrap self-signed certificates in `certs/local.crt` and `certs/local.key` (or obtain a trusted Let's Encrypt certificate for `<ip>.sslip.io`).
- Validate the configuration templates.
- Ensure proper permissions.

---

### Option B: Manual First-Time Setup
If you prefer full manual transparency:

```bash
cd ~/dograh

# 1. Create the certs directory
mkdir -p certs

# 2. Source the environment variables
set -a && . ./.env && set +a

# 3. Generate bootstrap self-signed SSL certificates for initial Nginx bringup
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/local.key \
  -out certs/local.crt \
  -subj "/CN=${PUBLIC_HOST:-$SERVER_IP}"

chmod 644 certs/local.crt certs/local.key

# 4. Run preflight validation to verify compose syntax and config templates
./remote_up.sh --preflight-only
```

---

## Step 8: Database Schema & Alembic Migrations

### 8.1 Automatic Migrations on Container Start
You do **not** need to run database migrations manually during ordinary deployments.

Inside `api/Dockerfile`, the container entrypoint invokes `scripts/start_services_docker.sh`. Lines 27–31 execute:
```bash
alembic -c "$BASE_DIR/api/alembic.ini" upgrade head
```
Every time the `api` container boots or updates, Alembic inspects PostgreSQL and applies all pending migrations before spawning the Uvicorn workers and ARQ background processes.

### 8.2 Manual Migration Inspection & Execution (Troubleshooting)
If you ever need to inspect or manually apply migrations without restarting the stack:

```bash
cd ~/dograh

# Inspect current database migration revision:
docker compose exec api alembic -c /app/api/alembic.ini current

# Inspect migration history:
docker compose exec api alembic -c /app/api/alembic.ini history

# Manually trigger upgrade head using the helper script:
docker compose exec api ./scripts/run_migrate.sh

# Or invoke alembic directly inside the container:
docker compose exec api alembic -c /app/api/alembic.ini upgrade head
```

---

## Step 9: Launching the Dograh Stack (`./remote_up.sh`)

Always launch and manage the production stack using the `./remote_up.sh` validated startup wrapper, rather than running a raw `docker compose up`.

### 9.1 What `./remote_up.sh` Handles Automatically:
1. **Preflight Validation**: Validates syntax, environment variables, and verifies that `dograh-init` can successfully render Nginx and Coturn templates.
2. **PostgreSQL Password Synchronization**: Automatically reconciles `POSTGRES_PASSWORD` in `.env` with the PostgreSQL role password in an existing Docker data volume via a local trusted socket, preventing database authentication failures.
3. **Profile Activation**: Automatically includes `--profile remote` (starting `dograh-init`, `nginx`, and `coturn`). If `SERVER_IP` is a private/local IP, it also enables `--profile tunnel` to run `cloudflared`.
4. **Image Pulling**: Pulls the latest images from Docker Hub (`--pull always`).
5. **Ownership Restoration**: Restores file ownership from `root` back to your non-root user via `SUDO_UID`.

### 9.2 Launch the Stack:
```bash
cd ~/dograh
./remote_up.sh
```

*(Note: If your user is not in the `docker` group, run `sudo ./remote_up.sh`.)*

### 9.3 Inspect Active Containers:
```bash
docker compose ps
```

Expected output:
```text
NAME           IMAGE                               COMMAND                  SERVICE       CREATED         STATUS                   PORTS
coturn         coturn/coturn:4.8.0                 "-c /etc/coturn/turn…"   coturn        1 minute ago    Up 1 minute              0.0.0.0:3478->3478/tcp, ...
dograh-api-1   yourdockerhuborg/dograh-api:latest  "./scripts/start_ser…"   api           1 minute ago    Up 1 minute (healthy)    8000/tcp
dograh-ui-1    yourdockerhuborg/dograh-ui:latest   "node server.js"         ui            1 minute ago    Up 1 minute (healthy)    3010/tcp
dograh_init    bash:5.2                            "/workspace/scripts/…"   dograh-init   1 minute ago    Exited (0)               
minio          minio/minio                         "server /data --cons…"   minio         1 minute ago    Up 1 minute (healthy)    127.0.0.1:9000->9000/tcp, ...
nginx_https    nginx:alpine                        "/docker-entrypoint.…"   nginx         1 minute ago    Up 1 minute              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
postgres       pgvector/pgvector:pg17              "docker-entrypoint.s…"   postgres      1 minute ago    Up 1 minute (healthy)    5432/tcp
redis          redis:7                             "docker-entrypoint.s…"   redis         1 minute ago    Up 1 minute (healthy)    6379/tcp
```
*(Notice that `dograh_init` completes and exits cleanly with code 0 after rendering configurations).*

---

## Step 10: Smoke Testing & Health Verification

Run these verification steps to ensure every component of the stack is operating correctly:

### 10.1 Verify API Health Endpoint
The API container exposes an internal health endpoint verified by Nginx reverse proxy:
```bash
# Test through local Nginx reverse proxy (use -k for self-signed bootstrap certs):
curl -k https://127.0.0.1/api/v1/health
```
Expected response:
```json
{"status":"healthy"}
```

### 10.2 Verify Nginx HTTP to HTTPS 301 Redirect
Ensure port 80 properly redirects browser traffic to port 443:
```bash
curl -I http://127.0.0.1/
```
Expected response:
```http
HTTP/1.1 301 Moved Permanently
Server: nginx/...
Location: https://127.0.0.1/
```

### 10.3 Verify Web Interface in Browser
Open your browser and navigate to:
```text
https://<PUBLIC_HOST>  (e.g., https://203-0-113-10.sslip.io or https://<SERVER_IP>)
```
*(If using self-signed bootstrap certificates, accept the temporary browser security warning)*.  
The Dograh login / signup dashboard should render cleanly.

### 10.4 Verify Coturn STUN/TURN Listener
Inspect Coturn container logs to verify network binding on ports 3478, 5349, and the relay port range:
```bash
docker compose logs coturn | grep -E "RFC 3489/5389/5766/6156|IPv4. listener"
```
You should see listeners bound to `0.0.0.0` with the external IP matching your `SERVER_IP`.

### 10.5 Verify MinIO Audio Proxy
Confirm that Nginx correctly proxies the `/voice-audio/` location without exposing MinIO port 9000 to the public:
```bash
curl -k -I https://127.0.0.1/voice-audio/
```
Should return an HTTP response from MinIO (e.g., 403 Access Denied or 404 Not Found for root path, confirming the proxy route is active).

---

## Initial Deployment Complete!

Your Dograh voice AI stack is now up and running on your VPS.

**Next Step**: To point your custom domain name (e.g. `voice.yourcompany.com`) to this server and install a free, auto-renewing Let's Encrypt SSL certificate, proceed to:  
👉 [Custom Domain & HTTPS Setup Guide](./custom-domain-steps.md)
