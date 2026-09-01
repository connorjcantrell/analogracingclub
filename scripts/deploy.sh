#!/usr/bin/env bash
# Deploy the Analog Racing Club stack (Node app + MongoDB) as a Docker Compose
# stack on the Orange Pi, behind the connorcantrell.com foundation (Caddy +
# Cloudflare Tunnel).
#
# Idempotent: safe to re-run (rebuilds + restarts; the mongo-data volume is
# retained). Routing is handled separately by scripts/add-route.sh.
#
#   ./scripts/deploy.sh                        # deploy to /srv/apps/analogracingclub on port 8004
#   APP_PORT=8004 DEST=/srv/apps/analogracingclub ./scripts/deploy.sh
#
# Requires a `.env` in DEST (or next to this repo — it is copied on first
# deploy) with ADMIN_PASSWORD and SESSION_SECRET set; see .env.example.
set -euo pipefail

APP_PORT="${APP_PORT:-8004}"
DEST="${DEST:-/srv/apps/analogracingclub}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Deploy dir: $DEST"
if [ ! -d "$DEST" ]; then
	sudo mkdir -p "$DEST"
	sudo chown "$USER:$USER" "$DEST"
fi

echo "==> Sync repo -> $DEST"
# Compose builds from this context; skip git/deps. `.env` in DEST is preserved
# (never overwritten by the sync).
rsync -a --delete \
	--exclude '.git' \
	--exclude 'node_modules' \
	--exclude '.env' \
	"$SRC"/ "$DEST"/

if [ ! -f "$DEST/.env" ]; then
	if [ -f "$SRC/.env" ]; then
		cp "$SRC/.env" "$DEST/.env"
	else
		echo "error: no $DEST/.env — copy .env.example there and set ADMIN_PASSWORD + SESSION_SECRET" >&2
		exit 1
	fi
fi
if ! grep -Eq '^ADMIN_PASSWORD=.+' "$DEST/.env"; then
	echo "error: ADMIN_PASSWORD is empty in $DEST/.env — the admin area would be unreachable" >&2
	exit 1
fi

echo "==> Build + start (app + mongo) on port $APP_PORT"
cd "$DEST"
APP_PORT="$APP_PORT" docker compose up -d --build

echo "==> Status"
docker compose ps

echo
echo "Local smoke test:  curl -s localhost:${APP_PORT}/api/series"
echo "Next: ./scripts/add-route.sh   (routes analogracingclub.com through the tunnel + Caddy)"
