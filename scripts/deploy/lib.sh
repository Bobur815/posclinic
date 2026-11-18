#!/usr/bin/env bash
#
# Shared posclinic deploy steps — sourced by scripts/deploy/staging.sh and production.sh, which
# run ON the VPS from the repo root once the checkout is current and .env is in place (0600).
# Adapted from posgro's scripts/deploy/staging.sh (same VPS, same sudo allowlist for `bobur`:
# nginx, `systemctl reload nginx`, cp, ln).
#
# Takes no secrets on argv: everything sensitive is read from ./.env (process arguments are
# world-readable via `ps` on this shared box).
#
# The caller sets:
#   COMPOSE     compose file              (docker-compose.staging.yml | docker-compose.yml)
#   PROJECT     compose project name      (posclinic-staging | posclinic)
#   SITES_DIR   nginx server blocks       (nginx/sites-staging | nginx/sites-prod)
#   LIVE_LIST   hosts whose TLS is issued (nginx/sites-live-staging.txt | nginx/sites-live-prod.txt)
#   LABEL       for messages              (Staging | Production)

validate_env() {
  echo "🔎 Validate .env"
  test -s .env                 || { echo "❌ .env is empty";       exit 1; }
  grep -q '^JWT_SECRET='  .env || { echo "❌ JWT_SECRET missing";  exit 1; }
  grep -q '^DB_USER='     .env || { echo "❌ DB_USER missing";     exit 1; }
  grep -q '^DB_PASSWORD=' .env || { echo "❌ DB_PASSWORD missing"; exit 1; }
  if grep -qE '^JWT_SECRET=("?change-me"?)?$' .env; then
    echo "❌ JWT_SECRET is empty or the .env.example placeholder"; exit 1
  fi
}

deploy_nginx() {
  echo "🌐 Deploy nginx configs"
  # One file per host, gated on $LIVE_LIST: a host gets its real (TLS) config only once listed
  # there, otherwise an ACME stub so certbot can issue the certificate. The deploy user cannot
  # read /etc/letsencrypt/live, so the gate is an explicit list, not a file probe.
  sudo cp nginx/snippets/*.conf /etc/nginx/snippets/

  local conf host installed stub
  for conf in "$SITES_DIR"/*.conf; do
    host="$(basename "$conf" .conf)"
    installed="/etc/nginx/sites-available/${host}"

    if grep -qxF "$host" "$LIVE_LIST" 2>/dev/null; then
      sudo cp "$conf" "$installed"
      echo "  ✅ ${host}"
    elif grep -q 'ssl_certificate' "$installed" 2>/dev/null; then
      echo "  ⚠️  ${host}: already serving TLS but not in ${LIVE_LIST}; LEFT UNTOUCHED."
    else
      stub="$(mktemp)"
      cat > "$stub" <<STUB
# AUTO-GENERATED BOOTSTRAP STUB: no TLS certificate for ${host} yet.
# Issue one, then add "${host}" to ${LIVE_LIST} and deploy again:
#   sudo certbot certonly --webroot -w /var/www/certbot --cert-name ${host} -d ${host}
server {
    listen 80;
    listen [::]:80;
    server_name ${host};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 503;
    }
}
STUB
      chmod 644 "$stub"
      sudo cp "$stub" "$installed"
      rm -f "$stub"
      echo "  ⏳ ${host}: not in ${LIVE_LIST}, ACME stub installed"
    fi

    sudo ln -sf "$installed" "/etc/nginx/sites-enabled/${host}"
  done

  if ! sudo nginx -t; then
    echo "❌ nginx config test failed: NOT reloading; the running config is untouched."
    echo "   Most likely a host in ${LIVE_LIST} has no certificate yet."
    exit 1
  fi
  sudo systemctl reload nginx
}

deploy_stack() {
  echo "🐘 Ensure ${LABEL} postgres is running"
  docker compose -f "$COMPOSE" up -d postgres

  echo "⏳ Waiting for ${LABEL} postgres..."
  local db_user
  db_user=$(grep '^DB_USER=' .env | cut -d= -f2-)
  timeout 90 bash -c '
    until docker compose -f "$1" exec -T postgres pg_isready -U "$2" >/dev/null 2>&1; do
      sleep 2
    done
  ' _ "$COMPOSE" "$db_user" \
    || { echo "❌ ${LABEL} postgres failed"; docker compose -f "$COMPOSE" logs --tail=50 postgres; exit 1; }

  echo "🐳 Build & deploy ${LABEL} api (migrations run in the container entrypoint)"
  docker compose -f "$COMPOSE" build api
  docker compose -f "$COMPOSE" up -d --no-deps api

  echo "⏳ Waiting for ${LABEL} api to be healthy..."
  timeout 180 bash -c '
    until docker compose -f "$1" ps api | grep -q "(healthy)"; do sleep 3; done
  ' _ "$COMPOSE" \
    && echo "✅ ${LABEL} API is healthy" \
    || { echo "❌ ${LABEL} API failed"; docker compose -f "$COMPOSE" logs --tail=100 api; exit 1; }

  echo "🧹 Prune dangling images from earlier builds"
  docker image prune -f --filter "label=com.docker.compose.project=${PROJECT}" >/dev/null || true

  echo "✅ ${LABEL} status"
  docker compose -f "$COMPOSE" ps
}
