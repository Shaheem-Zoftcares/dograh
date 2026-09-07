# Custom Domain, HTTPS, and Ongoing Deployment Guide

This guide details how to configure a custom domain name (e.g. `voice.yourcompany.com`) with a free, auto-renewing **Let's Encrypt SSL/TLS certificate** on your Dograh deployment, and documents the **ongoing update and rollback procedures** for production operations.

---

## Architecture: Zero-Downtime Webroot Validation

Dograh's Nginx reverse proxy is specifically designed to handle Let's Encrypt HTTP-01 challenges **without stopping the container stack**.

### How Webroot Validation Works:
1. **Directory Mapping**:
   - The host directory `~/dograh/certs/` is bind-mounted read-only into the Nginx container at `/etc/nginx/certs:ro`.
2. **Nginx Location Directive**:
   In `deploy/templates/nginx.remote.conf.template`:
   ```nginx
   server {
       listen 80;
       server_name voice.yourcompany.com;

       # Serve Let's Encrypt HTTP-01 challenges out of the certs webroot
       location ^~ /.well-known/acme-challenge/ {
           root /etc/nginx/certs;
           default_type "text/plain";
           try_files $uri =404;
       }

       # Redirect all other traffic to HTTPS
       location / {
           return 301 https://$host$request_uri;
       }
   }
   ```
3. **Webroot Parameter**:
   When Certbot is invoked with `-w "$(pwd)/certs"`, it writes temporary challenge tokens to `~/dograh/certs/.well-known/acme-challenge/<token>`.
4. **Validation**:
   Let's Encrypt servers request `http://voice.yourcompany.com/.well-known/acme-challenge/<token>`. Nginx resolves `root /etc/nginx/certs` + URI to `/etc/nginx/certs/.well-known/acme-challenge/<token>` and returns it with HTTP 200.
5. **No Downtime**:
   Nginx never needs to be stopped to free port 80. Your web and voice services remain active throughout issuance and renewal.

---

## Prerequisites

Before starting:
1. Dograh must already be running on your VPS (see [Initial Deployment Checklist](./initial-deploy.md)).
2. You must own a domain name (e.g. `yourcompany.com`) and have access to manage its DNS records at your registrar or DNS provider (Cloudflare, Route53, Namecheap, GoDaddy, etc.).
3. Your server's public IPv4 address (find via `curl -s ifconfig.me`).

---

## Step 1: Configure & Verify DNS A Records

### 1.1 Add DNS A Record
Log in to your DNS provider and create an **A record**:

| Record Type | Host / Name | Value / Destination | TTL |
|:------------|:------------|:--------------------|:----|
| **A** | `voice` (or `@` for root apex domain) | `<YOUR_SERVER_PUBLIC_IP>` | 300 seconds (5 min) |

> **Note for Cloudflare users**:  
> If using Cloudflare DNS, ensure the proxy status is set to **DNS Only** (gray cloud) during initial SSL issuance. Once Let's Encrypt issues the certificate, you can enable Cloudflare proxying (orange cloud) with SSL mode set to **Full (Strict)**.

### 1.2 MANDATORY: Pre-Verify DNS Resolution Before Running Certbot

⚠️ **CRITICAL**: Do NOT execute Certbot until you have verified DNS propagation. If Certbot attempts validation before your DNS record is live across the internet, Let's Encrypt will fail and log a failed authorization attempt. Exceeding **5 failed validations per hostname per hour** will result in a temporary rate-limit ban.

Run either of these commands from your local workstation or the VPS:

#### Verification with `dig`:
```bash
dig +short voice.yourcompany.com
```
*Expected output: Your server's public IP address (e.g. `203.0.113.10`).*

#### Verification with `nslookup`:
```bash
nslookup voice.yourcompany.com
```
*Expected output: Name resolution showing your domain pointing to your server's IP address.*

Compare with your server's live public IP:
```bash
curl -s ifconfig.me
```

**Proceed to Step 2 only when the returned IP matches your server's public IP.**

---

## Step 2: Automated Custom Domain Setup (`setup_custom_domain.sh`)

Dograh includes a production helper script that fully automates the transition from an IP/sslip.io address to your custom domain.

### 2.1 Run the Script
SSH into your VPS, navigate to your Dograh deployment directory, and execute:

```bash
cd ~/dograh
sudo ./scripts/setup_custom_domain.sh
```

### 2.2 Interactive Prompts:
The script will prompt for two inputs:
1. **Domain name**: Enter your fully qualified domain name (e.g. `voice.yourcompany.com`).
2. **Email address**: Enter your administrator email address for Let's Encrypt certificate expiration notices.

### 2.3 What the Automated Script Executes:
- **[1/6] DNS Verification**: Automatically resolves your domain via `dig` and verifies that it matches the server's public IP.
- **[2/6] Install Certbot**: Ensures `certbot` is installed via `apt-get`.
- **[3/6] Update `.env` & Re-render**: Updates `PUBLIC_HOST` and `PUBLIC_BASE_URL` in `.env`, runs preflight, and invokes `./remote_up.sh` so Nginx is listening with `server_name voice.yourcompany.com`.
- **[4/6] Obtain Let's Encrypt Certificate**: Executes Certbot in webroot mode (`-w ./certs`), creates challenge files, and copies the issued `fullchain.pem` and `privkey.pem` to `certs/local.crt` and `certs/local.key`.
- **[5/6] Reload Nginx**: Restarts the Nginx container to load the new TLS certificates into memory.
- **[6/6] Configure Auto-Renewal**: Installs an automated renewal hook at `/etc/letsencrypt/renewal-hooks/deploy/dograh-reload.sh` and executes a dry-run test (`certbot renew --dry-run`).

Once completed, your application is immediately available at `https://voice.yourcompany.com`.

---

## Step 3: Step-by-Step Manual Custom Domain & HTTPS Setup

If you prefer to perform every step manually without running the automated script, follow this procedure:

### 3.1 Install Certbot on the VPS
```bash
sudo apt-get update
sudo apt-get install -y certbot
```

### 3.2 Update `.env` with Your Custom Domain
Update the canonical host and base URL variables in `.env`:

```bash
cd ~/dograh

# Set your target domain
DOMAIN="voice.yourcompany.com"

sed -i "s/^PUBLIC_HOST=.*/PUBLIC_HOST=${DOMAIN}/" .env
sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${DOMAIN}|" .env
```

Ensure no stale overrides exist in `.env` (these should remain unset so Dograh derives endpoints from `PUBLIC_HOST`):
```bash
sed -i '/^BACKEND_URL=/d' .env
sed -i '/^BACKEND_API_ENDPOINT=/d' .env
sed -i '/^MINIO_PUBLIC_ENDPOINT=/d' .env
sed -i '/^TURN_HOST=/d' .env
```

### 3.3 Re-launch Stack to Apply Configuration
Re-run `./remote_up.sh` so `dograh-init` updates `default.conf` with your new domain in Nginx's `server_name` directive:

```bash
./remote_up.sh
```

Confirm that Nginx is running and responding on port 80:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
# Should return: 301
```

### 3.4 Issue Let's Encrypt Certificate (Webroot Mode)
Issue the certificate using Certbot with the webroot set to `$(pwd)/certs`:

```bash
cd ~/dograh
EMAIL="admin@yourcompany.com"
DOMAIN="voice.yourcompany.com"

sudo certbot certonly \
  --webroot -w "$(pwd)/certs" \
  --non-interactive \
  --agree-tos \
  --keep-until-expiring \
  --email "$EMAIL" \
  -d "$DOMAIN"
```

### 3.5 Copy Certificate to Dograh Directory
Copy the issued certificates to `certs/local.crt` and `certs/local.key` and set secure permissions:

```bash
sudo cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" certs/local.crt
sudo cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" certs/local.key

sudo chmod 644 certs/local.crt certs/local.key
```

### 3.6 Reload Nginx to Activate SSL
Restart the Nginx container so it loads the new certificates:

```bash
docker compose --profile remote restart nginx
```

### 3.7 Configure Automated Certificate Renewal Hook
Let's Encrypt certificates are valid for 90 days. Create a renewal deploy hook so that whenever Certbot's system timer renews the certificate, it automatically copies the new files and restarts Nginx:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/dograh-reload.sh > /dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(pwd)"
DOMAIN="${DOMAIN}"

if [[ -f "/etc/letsencrypt/live/\${DOMAIN}/fullchain.pem" ]]; then
    cp "/etc/letsencrypt/live/\${DOMAIN}/fullchain.pem" "\${DEPLOY_DIR}/certs/local.crt"
    cp "/etc/letsencrypt/live/\${DOMAIN}/privkey.pem" "\${DEPLOY_DIR}/certs/local.key"
    chmod 644 "\${DEPLOY_DIR}/certs/local.crt" "\${DEPLOY_DIR}/certs/local.key"
    
    cd "\${DEPLOY_DIR}"
    docker compose --profile remote restart nginx || true
fi
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/dograh-reload.sh
```

### 3.8 Test Auto-Renewal Simulation
Simulate certificate renewal to verify the hook and webroot challenge configuration:

```bash
sudo certbot renew --dry-run
```
*Expected output: `Congratulations, all simulated renewals succeeded`.*

---

## Step 4: Verification & Smoke Testing

### 4.1 HTTPS & Certificate Verification
Inspect the SSL certificate chain from your local machine:
```bash
curl -Iv https://voice.yourcompany.com
```
Look for:
- `SSL certificate verify ok`
- `issuer: C=US, O=Let's Encrypt, CN=R3` (or E1/E2)
- `HTTP/2 200` or `HTTP/1.1 200 OK`

### 4.2 API Endpoint Verification
```bash
curl https://voice.yourcompany.com/api/v1/health
```
Output:
```json
{"status":"healthy"}
```

### 4.3 Web Interface Verification
Open `https://voice.yourcompany.com` in your browser. Verify:
- Green padlock / valid SSL certificate icon without warnings.
- Next.js UI loads cleanly.
- Browser microphone permissions can be granted (browsers only allow mic access on valid HTTPS origins).

---

## Step 5: Ongoing Updates, CI/CD Pipeline, and Rollback Procedures

### 5.1 Automated CI/CD Pipeline Overview
When developers push changes to the `main` branch of the Git repository:

```
[Developer Git Push to main]
            │
            ▼
[GitHub Actions Runner]
  ├── Checks out repo with submodules (pipecat)
  ├── Builds Docker images: dograh-api & dograh-ui
  ├── Tags images with :latest AND :<git-sha>
  └── Pushes images to Docker Hub
            │
            ▼
[SSH Deploy Step to VPS]
  ├── Connects to SERVER_HOST via SERVER_SSH_KEY
  ├── Navigates to ~/dograh
  ├── Runs: docker compose pull api ui
  └── Runs: ./remote_up.sh
            │
            ▼
[Production VPS Updated & Running]
```

### 5.2 Manual Re-Deployment on VPS
If you need to manually trigger an update or re-deploy the latest images on the VPS:

```bash
ssh <user>@<SERVER_IP>
cd ~/dograh

# 1. Pull latest images from Docker Hub
docker compose pull api ui

# 2. Re-launch stack through validated wrapper
./remote_up.sh
```
`./remote_up.sh` will:
- Validate `.env`
- Ensure Postgres credentials match
- Apply any new Alembic database migrations automatically
- Recreate containers with zero downtime for dependent services

---

### 5.3 Rollback Procedure (Reverting to a Previous Version)

Because the CI/CD pipeline tags every build with both `:latest` and the unique commit Git SHA (e.g. `a1b2c3d4e5f67890abcdef1234567890abcdef12`), rolling back to a previous build is instantaneous and reliable.

#### Step 1: Identify the Target Git SHA
Find the commit SHA of the known stable release from:
- GitHub commit history
- Docker Hub image tag list for `dograh-api` and `dograh-ui`

#### Step 2: Update `docker-compose.override.yaml`
On your VPS, edit `docker-compose.override.yaml` to specify the exact `<git-sha>` tag instead of `latest`:

```bash
cd ~/dograh
nano docker-compose.override.yaml
```

Set the image tags to your desired Git SHA:
```yaml
services:
  api:
    image: ${DOCKERHUB_REPO}/dograh-api:a1b2c3d4e5f67890abcdef1234567890abcdef12
    pull_policy: always

  ui:
    image: ${DOCKERHUB_REPO}/dograh-ui:a1b2c3d4e5f67890abcdef1234567890abcdef12
    pull_policy: always
```

#### Step 3: Apply the Rollback
Re-launch the stack using `./remote_up.sh`:

```bash
./remote_up.sh
```
Docker Compose will pull the specified SHA images and recreate the `api` and `ui` containers.

#### Step 4: Verify the Rollback
Check running container image digests and service health:
```bash
docker compose ps
curl https://voice.yourcompany.com/api/v1/health
```

#### Step 5: Database Schema Considerations during Rollback
If the newer release introduced database schema migrations that are incompatible with the older code, inspect Alembic status and downgrade if required:

```bash
# Check current migration revision:
docker compose exec api alembic -c /app/api/alembic.ini current

# To downgrade one migration step if necessary:
docker compose exec api alembic -c /app/api/alembic.ini downgrade -1
```

#### Step 6: Returning to `:latest` Tracking
Once the upstream bug is fixed in `main`, restore `docker-compose.override.yaml` back to `:latest`:
```yaml
services:
  api:
    image: ${DOCKERHUB_REPO}/dograh-api:latest
    pull_policy: always

  ui:
    image: ${DOCKERHUB_REPO}/dograh-ui:latest
    pull_policy: always
```
And re-run `./remote_up.sh`.

---

## Step 6: Troubleshooting

### 6.1 Certbot Validation Times Out or Fails with 404
- **Cause**: Port 80 is blocked by a firewall or cloud security group, or Nginx is not running.
- **Remedy**:
  1. Check firewall: `sudo ufw status verbose` (ensure port 80/tcp is ALLOW).
  2. Verify cloud security group (AWS, GCP, Hetzner, DigitalOcean) allows inbound port 80.
  3. Ensure Nginx is running: `docker compose ps nginx`.
  4. Test local response: `curl -I http://127.0.0.1/.well-known/acme-challenge/test`.

### 6.2 DNS Mismatch Warning
- **Cause**: Your local machine or VPS is querying a DNS cache that hasn't refreshed.
- **Remedy**:
  1. Query public DNS resolvers directly: `dig @8.8.8.8 +short voice.yourcompany.com` or `dig @1.1.1.1 +short voice.yourcompany.com`.
  2. If using Cloudflare, verify proxy mode is temporarily set to **DNS Only** (gray cloud).

### 6.3 Browser Displays "Certificate Insecure" or "Self-Signed"
- **Cause**: Nginx was not restarted after copying new certificates, or old certificates remain in `certs/local.crt`.
- **Remedy**:
  1. Check certificate file dates: `ls -la ~/dograh/certs/`.
  2. Verify certificate domain:
     ```bash
     openssl x509 -in ~/dograh/certs/local.crt -noout -text | grep -A 2 "Subject Alternative Name"
     ```
  3. Restart Nginx: `docker compose --profile remote restart nginx`.

### 6.4 Voice Calls Connect but No Audio Flows (WebRTC NAT Issues)
- **Cause**: Coturn configuration does not have the correct `SERVER_IP` or firewall blocked UDP relay range.
- **Remedy**:
  1. Verify Coturn ports in UFW: 3478 (TCP/UDP), 5349 (TCP/UDP), and 49152-49200 (UDP).
  2. Verify Coturn logs: `docker compose logs coturn | tail -n 50`.
  3. Verify `SERVER_IP` in `.env` is set to your VPS public IPv4 address, and run `./remote_up.sh` to update Coturn's external IP binding.
