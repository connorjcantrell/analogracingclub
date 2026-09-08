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
# Requires a `.env` next to this repo (synced into DEST on every deploy) or
# already in DEST, with admin auth configured: either CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD
# (Cloudflare Access, as league uses) or ADMIN_PASSWORD; see .env.example.
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
# Compose builds from this context; skip git/deps. `.env` is handled below.
rsync -a --delete \
	--exclude '.git' \
	--exclude 'node_modules' \
	--exclude '.env' \
	--exclude '.svelte-kit' \
	--exclude 'build' \
	--exclude 'docker-compose.override.yml' \
	--exclude 'public/assets/rounds/' \
	"$SRC"/ "$DEST"/

# The repo checkout's .env (gitignored) is the source of truth when it exists:
# sync it so edits made there reach the running stack. Without one, whatever
# is already in DEST is kept.
if [ -f "$SRC/.env" ]; then
	if ! cmp -s "$SRC/.env" "$DEST/.env" 2>/dev/null; then
		echo "==> Sync .env -> $DEST/.env"
		cp "$SRC/.env" "$DEST/.env"
	fi
elif [ ! -f "$DEST/.env" ]; then
	echo "error: no $DEST/.env — copy .env.example there and configure admin auth" >&2
	exit 1
fi
if grep -Eq '^CF_ACCESS_TEAM_DOMAIN=.+' "$DEST/.env" && grep -Eq '^CF_ACCESS_AUD=.+' "$DEST/.env"; then
	echo "==> Admin auth: Cloudflare Access"
elif grep -Eq '^ADMIN_PASSWORD=.+' "$DEST/.env"; then
	echo "==> Admin auth: password"
else
	echo "error: no admin auth in $DEST/.env — set CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD (or ADMIN_PASSWORD); otherwise the admin area is unreachable" >&2
	exit 1
fi

echo "==> Build + start (app + mongo) on port $APP_PORT"
# The Compose project name is the directory basename ("analogracingclub"), so a
# stack previously started from the repo checkout is the same project: this
# recreates its containers from DEST and keeps the named volumes.
cd "$DEST"
APP_PORT="$APP_PORT" docker compose up -d --build

echo "==> Status"
docker compose ps

echo
echo "Local smoke test:  curl -s localhost:${APP_PORT}/api/series"
echo "Next: ./scripts/add-route.sh   (routes analogracingclub.com through the tunnel + Caddy)"
