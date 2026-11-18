#!/usr/bin/env bash
#
# Nightly dump of the PRODUCTION clinic database — runs ON the VPS from cron (installed by
# scripts/deploy/production.sh), in ~/posclinic. Patient data: the dump stays on the VPS
# (~/backups/posclinic, 0700/0600); copying it off-site is the owner's call.
#
# Credentials are read inside the Postgres container ($POSTGRES_USER / $POSTGRES_DB), so nothing
# secret is on a command line. Custom format (-Fc) is already compressed; restore with
#   pg_restore --clean --if-exists -d <db> <file>
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

COMPOSE="docker-compose.yml"
DIR="$HOME/backups/posclinic"
KEEP_DAYS=14

umask 077
mkdir -p "$DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
out="$DIR/posclinic-${stamp}.dump"
tmp="${out}.part"

echo "[$(date -Is)] backup start"
if ! docker compose -f "$COMPOSE" exec -T postgres \
     sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"; then
  rm -f "$tmp"
  echo "[$(date -Is)] ❌ pg_dump failed; older backups kept"
  exit 1
fi

# A dump that pg_restore cannot list is not a backup.
if ! docker compose -f "$COMPOSE" exec -T postgres pg_restore --list < "$tmp" >/dev/null; then
  rm -f "$tmp"
  echo "[$(date -Is)] ❌ dump is unreadable; older backups kept"
  exit 1
fi

mv "$tmp" "$out"
echo "[$(date -Is)] ✅ $(basename "$out") $(du -h "$out" | cut -f1)"

# Only after a good dump: drop ones older than KEEP_DAYS, but never the newest 7.
mapfile -t all < <(ls -1t "$DIR"/posclinic-*.dump 2>/dev/null)
for f in "${all[@]:7}"; do
  if [ -n "$(find "$f" -mtime +"$KEEP_DAYS")" ]; then
    rm -f "$f"
    echo "[$(date -Is)] 🧹 removed $(basename "$f")"
  fi
done
