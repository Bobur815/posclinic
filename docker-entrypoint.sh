#!/bin/sh
# Container start: apply pending migrations (when RUN_MIGRATIONS=true), then run as `node`.
# Migrations are additive only once real clinic data exists (.claude/rules/prisma.md).
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  su-exec node npx prisma migrate deploy
fi

exec su-exec node "$@"
