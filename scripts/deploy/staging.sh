#!/usr/bin/env bash
#
# posclinic staging deploy — runs ON the VPS (~/posclinic-staging), invoked by
# .github/workflows/deploy-staging.yml (push to dev). The steps are in scripts/deploy/lib.sh.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

COMPOSE="docker-compose.staging.yml"
PROJECT="posclinic-staging"
SITES_DIR="nginx/sites-staging"
LIVE_LIST="nginx/sites-live-staging.txt"
LABEL="Staging"

# shellcheck source=lib.sh
source scripts/deploy/lib.sh

validate_env
deploy_nginx
deploy_stack
