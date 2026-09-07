#!/usr/bin/env bash
# ==============================================================================
# Dograh VPS File Transfer Helper (Zero Git Remote Exposure)
# ==============================================================================
# This script bundles only the necessary deployment orchestration files and
# streams them directly over SSH to the remote VPS using a tar pipe.
#
# It excludes:
#   - Application source code (api/, ui/, pipecat/)
#   - Git repository metadata (.git/)
#   - Local environment files (.env)
#   - Local caches and dependencies (node_modules/, venv/, .venv/)
#
# Usage:
#   ./deploy/sync_vps.sh <user@vps-host> [remote_dir]
#
# Examples:
#   ./deploy/sync_vps.sh ubuntu@203.0.113.50
#   ./deploy/sync_vps.sh ubuntu@203.0.113.50 ~/dograh
#   SSH_OPTS="-p 2222 -i ~/.ssh/deploy_key" ./deploy/sync_vps.sh ubuntu@203.0.113.50
# ==============================================================================

set -euo pipefail

DEST="${1:-}"
REMOTE_DIR="${2:-~/dograh}"
SSH_OPTS="${SSH_OPTS:-}"

# Check for destination argument
if [ -z "$DEST" ]; then
  echo "Error: Missing destination user@host argument." >&2
  echo "" >&2
  echo "Usage:" >&2
  echo "  $0 <user@vps-host> [remote_dir]" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  $0 ubuntu@203.0.113.50" >&2
  echo "  $0 ubuntu@203.0.113.50 ~/dograh" >&2
  exit 1
fi

# Ensure running from repository root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "========================================================================"
echo " Packaging Dograh Deployment Artifacts"
echo "========================================================================"

# Required files to verify before streaming
REQUIRED_FILES=(
  "docker-compose.yaml"
  "docker-compose.override.yaml"
  "remote_up.sh"
  "scripts/lib/setup_common.sh"
  "scripts/run_dograh_init.sh"
  "scripts/setup_remote.sh"
  "scripts/setup_custom_domain.sh"
  "scripts/run_migrate.sh"
  "deploy/templates/nginx.remote.conf.template"
  "deploy/templates/turnserver.remote.conf.template"
  "deploy/.env.production.template"
)

# Verify all required files exist
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "[-] Error: Missing required deployment file: $file" >&2
    exit 1
  fi
  echo "  [+] Verified: $file"
done

echo ""
echo "========================================================================"
echo " Streaming Deployment Bundle to $DEST:$REMOTE_DIR"
echo "========================================================================"

# Create remote target directory and required subdirectories
# shellcheck disable=SC2086
ssh $SSH_OPTS "$DEST" "mkdir -p $REMOTE_DIR $REMOTE_DIR/certs"

# Stream minimal tarball directly over SSH into tar extraction
# shellcheck disable=SC2086
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
| ssh $SSH_OPTS "$DEST" "tar -xzf - -C $REMOTE_DIR && chmod +x $REMOTE_DIR/remote_up.sh $REMOTE_DIR/scripts/*.sh"

echo ""
echo "========================================================================"
echo " Transfer Complete! Zero Source Code / Git Metadata Transferred."
echo "========================================================================"
echo "Next steps on the VPS ($DEST):"
echo "  1. SSH into the server:"
echo "     ssh $DEST"
echo "  2. Change to the deployment directory:"
echo "     cd $REMOTE_DIR"
echo "  3. Log in to Docker Hub (to pull CI-built private images):"
echo "     docker login"
echo "  4. Create and populate your production .env:"
echo "     cp deploy/.env.production.template .env"
echo "     nano .env"
echo "  5. Run first-time setup (preserves local files with DOGRAH_SKIP_DOWNLOAD=1):"
echo "     DOGRAH_SKIP_DOWNLOAD=1 sudo -E ./scripts/setup_remote.sh"
echo "========================================================================"
