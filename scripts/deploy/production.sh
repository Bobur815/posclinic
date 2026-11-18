#!/usr/bin/env bash
#
# posclinic PRODUCTION deploy — runs ON the VPS (~/posclinic), invoked by
# .github/workflows/deploy.yml (push to main). The steps are in scripts/deploy/lib.sh; on top of
# staging it installs the nightly database backup (scripts/deploy/backup.sh).
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

COMPOSE="docker-compose.yml"
PROJECT="posclinic"
SITES_DIR="nginx/sites-prod"
LIVE_LIST="nginx/sites-live-prod.txt"
LABEL="Production"

# shellcheck source=lib.sh
source scripts/deploy/lib.sh

validate_env
deploy_nginx
deploy_stack

echo "💾 Ensure the nightly backup is scheduled"
# The deploy user's own crontab (no sudo). The marker comment makes this idempotent: the old line
# is replaced, never duplicated. Backups live in ~/backups/posclinic, outside the checkout, so
# the deploy's `git clean` never touches them.
mkdir -p "$HOME/backups/posclinic"
chmod 700 "$HOME/backups/posclinic"
CRON_LINE="30 2 * * * cd $PWD && bash scripts/deploy/backup.sh >> $HOME/backups/posclinic/backup.log 2>&1 # posclinic-backup"
{ crontab -l 2>/dev/null | grep -v '# posclinic-backup$' || true; echo "$CRON_LINE"; } | crontab -
echo "  ✅ $(crontab -l | grep '# posclinic-backup$')"
