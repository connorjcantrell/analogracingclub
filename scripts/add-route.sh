#!/usr/bin/env bash
# Route analogracingclub.com to this app through the connorcantrell.com
# foundation: Cloudflare Tunnel (cloudflared) -> Caddy -> localhost:$APP_PORT.
#
# analogracingclub.com is a separate Cloudflare zone, so unlike a
# *.connorcantrell.com subdomain it needs three things:
#   1. Tunnel ingress rules for the apex + www (the existing rules only match
#      connorcantrell.com hosts).
#   2. A Caddy site block (www redirects to the apex).
#   3. DNS in the analogracingclub.com zone: proxied CNAMEs for @ and www
#      pointing at <TUNNEL_UUID>.cfargotunnel.com. This script tries
#      `cloudflared tunnel route dns`; if that fails (the origin cert from
#      `cloudflared tunnel login` is scoped to the connorcantrell.com zone), add
#      the two CNAMEs in the Cloudflare dashboard — it prints exactly what to add.
#
# Idempotent: re-running is a no-op where the config is already in place. Edits
# are made in the connorcantrell.com repo (version-controlled source of truth),
# then copied to /etc and validated before reload.
#
#   ./scripts/add-route.sh
#   FOUNDATION=/path/to/connorcantrell.com APP_PORT=8004 ./scripts/add-route.sh
set -euo pipefail

APP_PORT="${APP_PORT:-8004}"
HOST="${HOST:-analogracingclub.com}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOUNDATION="${FOUNDATION:-$(cd "$SRC/../connorcantrell.com" && pwd)}"
CADDYFILE="$FOUNDATION/caddy/Caddyfile"
TUNNEL_TEMPLATE="$FOUNDATION/cloudflared/config.yml"
TUNNEL_LIVE=/etc/cloudflared/config.yml
TUNNEL_NAME="${TUNNEL_NAME:-connorcantrell}"

[ -f "$CADDYFILE" ] || { echo "error: $CADDYFILE not found" >&2; exit 1; }
[ -f "$TUNNEL_TEMPLATE" ] || { echo "error: $TUNNEL_TEMPLATE not found" >&2; exit 1; }

# ---- 1. Tunnel ingress ------------------------------------------------------
add_ingress() {
	local file="$1"
	if grep -q "hostname: $HOST" "$file"; then
		echo "==> $file already routes $HOST"
		return
	fi
	echo "==> Adding $HOST + www.$HOST ingress to $file"
	# Insert both rules directly above the catch-all (the last rule).
	awk -v host="$HOST" '
		!done && /^  - service: http_status:404/ {
			printf "  - hostname: %s\n    service: http://localhost:80\n", host
			printf "  - hostname: www.%s\n    service: http://localhost:80\n", host
			done=1
		}
		{ print }
	' "$file" > "$file.tmp"
	if [ -w "$file" ]; then mv "$file.tmp" "$file"; else sudo mv "$file.tmp" "$file"; fi
}
add_ingress "$TUNNEL_TEMPLATE"
if [ -f "$TUNNEL_LIVE" ]; then
	# The live file carries the real tunnel UUID + credentials path; patch it in
	# place rather than copying the template over it.
	sudo cp "$TUNNEL_LIVE" "$TUNNEL_LIVE.bak"
	tmp="$(mktemp)"; sudo cat "$TUNNEL_LIVE" > "$tmp"
	add_ingress "$tmp"
	sudo cp "$tmp" "$TUNNEL_LIVE"; rm -f "$tmp"
	echo "==> Validate tunnel ingress"
	sudo cloudflared tunnel --config "$TUNNEL_LIVE" ingress validate
	echo "==> Restart cloudflared"
	sudo systemctl restart cloudflared
else
	echo "warn: $TUNNEL_LIVE not found — tunnel not installed on this host? Skipping live restart."
fi

# ---- 2. Caddy site block ----------------------------------------------------
if grep -q "http://$HOST" "$CADDYFILE"; then
	echo "==> Route for $HOST already present in repo Caddyfile."
else
	echo "==> Inserting $HOST route (-> localhost:$APP_PORT) above the catch-all"
	block=$'# --- Analog Racing Club (separate zone; ingress added in cloudflared/config.yml) --\nhttp://www.'"$HOST"$' {\n\tredir https://'"$HOST"$'{uri} permanent\n}\nhttp://'"$HOST"$' {\n\treverse_proxy localhost:'"$APP_PORT"$'\n}\n\n'
	awk -v block="$block" '
		!done && /^# --- Catch-all/ { printf "%s", block; done=1 }
		{ print }
	' "$CADDYFILE" > "$CADDYFILE.tmp"
	mv "$CADDYFILE.tmp" "$CADDYFILE"
fi

echo "==> Deploy -> /etc/caddy/Caddyfile"
sudo cp "$CADDYFILE" /etc/caddy/Caddyfile
CADDY_BIN="$(command -v caddy || echo /usr/local/bin/caddy)"
echo "==> Validate"
sudo "$CADDY_BIN" validate --config /etc/caddy/Caddyfile
echo "==> Reload (zero downtime)"
sudo systemctl reload caddy

# ---- 3. DNS in the analogracingclub.com zone ---------------------------------
uuid="$(grep -E '^tunnel:' "${TUNNEL_LIVE:-$TUNNEL_TEMPLATE}" 2>/dev/null | awk '{print $2}' || true)"
echo
echo "==> DNS: point $HOST at the tunnel"
if cloudflared tunnel route dns "$TUNNEL_NAME" "$HOST" 2>/dev/null && cloudflared tunnel route dns "$TUNNEL_NAME" "www.$HOST" 2>/dev/null; then
	echo "    CNAMEs created via cloudflared."
else
	echo "    cloudflared could not create the records (its cert is scoped to connorcantrell.com)."
	echo "    Add these in the Cloudflare dashboard for the $HOST zone (Proxied = ON):"
	echo "      CNAME  @    ${uuid:-<TUNNEL_UUID>}.cfargotunnel.com"
	echo "      CNAME  www  ${uuid:-<TUNNEL_UUID>}.cfargotunnel.com"
	echo "    and set SSL/TLS mode to Full (the tunnel carries the origin hop)."
fi

echo
echo "Done. Verify:  curl -s -H 'Host: $HOST' http://localhost/api/series"
echo "External:      https://$HOST"
