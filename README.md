# Analog Racing Club

Website for the Analog Racing Club iRacing league — `analogracingclub.com`. Successor to the
[league](https://github.com/connorjcantrell/league) site. Node.js + MongoDB; an admin area
where iRacing result files are uploaded and scored; standings computed per series.

## Quick start (local)

```sh
docker run -d --name arc-mongo -p 27017:27017 -v arc-mongo-data:/data/db mongo:7
npm install
npm start                       # http://localhost:8004 — /admin is open from localhost (no password set)
```

Or the whole stack in containers (set `ADMIN_PASSWORD` in `.env` first — see `.env.example`):

```sh
cp .env.example .env            # fill in ADMIN_PASSWORD (+ SESSION_SECRET: openssl rand -hex 32)
docker compose up -d --build    # app on :8004 + mongo
```

Then open `/admin`, create a series, and upload a result. A sample iRacing file lives in
`data/eventresult-86498933.json`; from the CLI:

```sh
npm run ingest data/eventresult-86498933.json -- --series <slug> --round 1
```

## Series, events, and points

Everything scored is a **series** with a **type**:

| Type | Use |
|---|---|
| `event` | a one-off special event (defaults to 1 round) |
| `season` | a seasonal series |
| `championship` | the annual championship |

Any number can be **active** at once (status `upcoming` → `active` → `complete`). Each series
carries its **own points format** — a copy of a named preset, or a custom JSON scale edited in
admin — so a season and the championship can score differently. Changing a series' format
rescores its stored results from the original JSON.

An event that counts toward two series (a season round that is also a championship round) is
simply uploaded to both; each series scores it under its own format.

### ARC standard format (the default preset)

| Session | Points |
|---|---|
| Qualifying | P1–P4: **7, 5, 3, 1** |
| Sprint | **1 point for leading a lap** (no finishing points) |
| Feature | P1–P16: **20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1** |

AI cars are stripped before scoring and positions re-ranked among humans. Presets live in
`src/scoring/formats.js`; add one there to offer it in the admin "New series" form.

## Architecture

- **Storage:** MongoDB. A **subsession is one document**: the uploaded event JSON kept verbatim
  under `raw` (envelope `type` under `rawType`) plus derived fields (sessions → results with
  computed points, track, times). `series` and `drivers` are their own collections.
- **Ingestion:** `src/import/` unwraps the iRacing `{ type, data }` envelope, builds the document
  (`build-document.js`, pure), and upserts it keyed on `<series>:<subsession_id>`.
- **Scoring:** `src/scoring/` — presets, a pure calculator, and `rescore` (rebuild from raw).
- **Standings:** `src/standings/` folds stored results into per-driver, per-round totals.
- **Web:** static pages in `public/` hitting the API. The homepage shows the most recent event
  across every series, plus the active series.

| Path | What |
|------|------|
| `src/config.js` | env config (`PORT`, `MONGO_URL`, `MONGO_DB`, `ADMIN_PASSWORD`, `SESSION_SECRET`) |
| `src/db/` | Mongo client + collections + indexes |
| `src/series.js` | series types + statuses |
| `src/scoring/` | `formats` (presets), `calculator`, `rescore` |
| `src/import/` | mappers, document builder, ingest, CLI |
| `src/standings/` | standings fold |
| `src/api/` | read queries |
| `src/admin/` | login (`auth.js`), admin API (`routes.js`), `admin.html`, `login.html` |
| `src/server.js` | Node `http` server: `/api/*`, `/admin*`, static `public/` |
| `Dockerfile`, `docker-compose.yml` | app image + app/mongo stack |

## API

Public: `GET /api/series[?status=active]` · `GET /api/series/:slug` · `GET /api/standings?series=` ·
`GET /api/results?series=` · `GET /api/latest` · `GET /api/drivers` ·
`GET /api/subsessions[?series=][/:id]`

Admin (session cookie required): `GET /api/admin/formats` · `GET|POST /api/admin/series` ·
`DELETE /api/admin/series/:slug` · `POST /api/admin/series-update` · `POST /api/admin/series-points` ·
`POST /api/admin/upload?series=&round=` · `GET /api/admin/subsessions/:id/download` ·
`DELETE /api/admin/subsessions/:id` · `POST /api/admin/rescore`

## Admin

`/admin` (unlinked from the public nav) is protected by a password login at `/admin/login`.
Set `ADMIN_PASSWORD` in the environment; a successful login sets a signed, HttpOnly session
cookie (one week; `SESSION_SECRET` signs it — leave it empty and every restart logs you out).
Ten failed attempts from one IP lock login for 15 minutes.

**Dev mode:** with `ADMIN_PASSWORD` unset, admin routes work **only from loopback** — handy for
`npm start` locally, but inside Docker that means unreachable, so always set it for Compose.

## Deploy (behind the connorcantrell.com foundation)

Runs as a Docker Compose stack on the Orange Pi; Cloudflare Tunnel → Caddy → `localhost:8004`.
`analogracingclub.com` is its own Cloudflare zone, so it needs its own tunnel ingress and DNS.

```sh
./scripts/deploy.sh      # rsync -> /srv/apps/analogracingclub, docker compose up -d --build
./scripts/add-route.sh   # tunnel ingress + Caddy block + DNS instructions for analogracingclub.com
```

`deploy.sh` refuses to run without an `ADMIN_PASSWORD` in the deploy dir's `.env`.
`add-route.sh` adds `analogracingclub.com` + `www` to the tunnel ingress (repo template and
`/etc/cloudflared/config.yml`), a Caddy site block (www → apex redirect), reloads both, then
creates the zone's CNAMEs via `cloudflared tunnel route dns` or prints the two records to add
in the dashboard (`@` and `www` → `<TUNNEL_UUID>.cfargotunnel.com`, proxied).

**Rollback:** remove the Caddy block + ingress rules and reload; `docker compose down` (the
`mongo-data` volume is retained).

**Backup:** the `mongo` volume is the only state.
```sh
docker compose exec mongo mongodump --db arc --archive | gzip > arc-$(date +%F).gz
```
