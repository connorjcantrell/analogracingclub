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

Then open `/admin`, create a series, and upload a result (see [Admin auth](#admin-auth) for
how the area is protected in production). A sample iRacing file lives in
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
| Sprint | No finishing points |
| Feature | P1–P16: **20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1** |
| Sprint or feature | **1 point for leading a lap** |

The lap-led bonus is worth **1 point per round**: a driver who leads in both the sprint and
the feature still scores a single point, not two.

AI cars are stripped before scoring and positions re-ranked among humans. So are **entrants
who completed no laps**: iRacing lists every registered driver in every session and gives each
a finish position, even one who never left the pits, so a no-show would otherwise be scored as
a finisher. The check is per session — a driver who sits out qualifying but races still counts
in the race. Presets live in
`src/scoring/formats.js`; add one there to offer it in the admin "New series" form.

> Changing a preset only affects **new** series — each series stores its own copy of the
> config at creation. To apply it to an existing series, open it in the admin page and
> re-pick the format (saving rescores every stored result in that series).

### Power rankings

`/drivers.html` ranks every driver across **all seasons**, not just the current one. Each
metric is averaged over a driver's events, then **the field is ranked on it and spread evenly
from 100 (best) to 0 (worst)**. Because every category lands on the same scale whatever its
units — placings, lap positions, cars passed — the weights mean what they say, and no single
runaway value can dominate.

| Weight | Metric | |
|---|---|---|
| 35% | Average finishing place per event | lower is better |
| 15% | Average cars passed (start − finish) | higher is better |
| 15% | Average **best**-lap placing per session | lower is better |
| 15% | Average **mean**-lap placing per session | lower is better |
| 15% | Share of the race's led laps | higher is better |
| 5% | Races seen to the flag | higher is better |

**Overall** is the result of the weekend as a whole, and what that means depends on the
event: a scored series round is decided on **total points**, while a special event awards
none, so the **feature finish** is the result (falling back to the sprint if there was no
feature). `overallOrder()` detects which applies from whether any points were awarded, so it
handles a scored series whose format happens to pay nothing.

**Lap-time placings** are computed twice per session — once on each driver's *best* lap and
once on their *mean* lap (iRacing's `average_lap`, stored as `averageLapTime`) — then averaged
across qualifying, sprint and feature. Best lap captures outright speed; mean lap captures
pace over a full run, so a driver with one hot lap and a scruffy race does not out-rate a
consistently quick one.

**Cars passed** is `start − finish` over every official session, so qualifying counts wherever
a grid slot was recorded.

The published rating is then mapped onto **45–100** (`RATING_FLOOR`) rather than 0–100. The
scale is rank-based, so someone is always last and would otherwise post a bare 0; the floor
keeps the bottom of the table readable without changing anyone's order. The underlying
component scores stay on the raw 0–100 scale in the API.

Ranking deliberately discards margin — a narrow win scores the same as a runaway one — so the
table also reports **Gap**: how far each driver's average finish sits behind the leader's.

**Recency is per driver**, counted over the races they actually entered rather than the league
calendar — a driver returning from a break is judged on their own recent form, not decayed for
rounds they missed. Their last three races count in full, the next seven taper linearly, and
anything past ten races is excluded outright (`MAX_RACES`).

The site itself does not expose the weights: `/drivers.html` shows only the rating, with a
plain-language "How it works" note. The full breakdown stays in `GET /api/power`.

Drivers below `minEvents` (default 3, `MIN_EVENTS`) are flagged **provisional** and sorted
last, so a newcomer with one win does not top the table. Tunables live in
`src/power/index.js`; `GET /api/power` accepts `?series=` and `?minEvents=`.

### Uploading a result

The **Upload results** panel takes one iRacing event-result JSON, then asks what it was:

- **Round of a series** — pick the series and round number. An event counting toward two
  series (a season round that is also a championship round) is uploaded to each, and scored
  under each one's format.
- **One-off special event** — just type a name. The event is created on the fly as unscored
  with a single round; no series setup needed. It then appears on the home page and results
  page like any other race, photos and all.

Re-uploading the same session to the same series replaces it rather than duplicating.

### What each page shows

The site never assumes an event ran qualifying, a sprint and a feature. Both the home page
and the results page read the sessions actually present in the uploaded result, so a special
event that is only a feature gets one tab and one winner, not three with two empty. Columns
with nothing in them (points on an unscored event, grid slots that were never recorded) drop
out too.

**Fast Four** is the exception, because it is a *points-format* feature rather than a session
one: it names the qualifying places the series actually pays. `publicSeries` exposes
`qualifyingPlaces` from the format's `qualifying.base`, so the ARC standard (7-5-3-1) shows a
Fast Four card, and a format scoring no qualifying places shows none.

### Race photos

Each stored result has a **Photos** panel in the admin results list: upload one or more
images (JPEG/PNG/GIF/WebP) and they appear as a gallery on the results page and the home
page, with a click-to-enlarge lightbox. Oversized files are downscaled in the browser
before upload, so phone and camera shots go up as-is.

Mark one photo per round as **★ Featured** and it becomes the hero image at the top of the
home page's latest-event section. Removing the featured photo clears the flag rather than
leaving a broken hero; with none set, the home page falls back to the round's first photo.
Files are stored under `public/assets/rounds/<subsession>/`, named by content hash (so
re-uploading the same file is a no-op) and kept in the `round-images` volume.

### Deleting a series

The **Delete** button in the *Edit series* panel removes the series **and every result filed
under it**, including uploaded photos, then drops drivers no longer referenced by any result.
It asks you to type the series slug before doing anything. The API mirrors that:
`DELETE /api/admin/series/:slug` without `?confirm=<slug>` is a dry run that answers 409 with the
result count; with it, the cascade runs and the response reports how many results and photos
went. Deleting a single result (`DELETE /api/admin/subsessions/:id`) also removes its photos.

## Admin auth

`/admin` and `/api/admin/*` are gated by `requireAdmin` (`src/admin/auth.js`), which picks a
mode from the environment:

1. **Cloudflare Access** (production — same scheme as league): set `CF_ACCESS_TEAM_DOMAIN` and
   `CF_ACCESS_AUD`. Access challenges the visitor at the edge (GitHub via the Zero Trust identity
   provider) and forwards a signed JWT; the origin verifies it against the team JWKS (signature,
   audience, issuer, expiry — fail-closed, `src/admin/access.js`). The password form is bypassed
   and "Log out" goes to Cloudflare's `/cdn-cgi/access/logout`.
2. **Password form**: `ADMIN_PASSWORD` set, Access unset. A signed, expiring cookie
   (`SESSION_SECRET`) keeps you logged in; 10 failed attempts lock an IP for 15 minutes.
3. **Dev mode**: nothing set — admin works only from loopback.

### Cloudflare Access setup

1. Zero Trust dashboard → **Access → Applications → Add an application → Self-hosted**.
   Domain `analogracingclub.com`, and add the paths `/admin` and `/api/admin`
   (each as its own public hostname entry, path prefix). The identity provider (GitHub) and
   team domain already exist from the league app; reuse them.
2. **Policy**: Allow, include your GitHub login / email (copy league's policy).
3. Copy the application's **Audience (AUD) tag** into `.env` alongside the team domain
   (`connorcantrell.cloudflareaccess.com`), then `docker compose up -d`.
4. Verify: `/admin` in a fresh browser triggers the GitHub login; `curl https://analogracingclub.com/api/admin/series`
   with no token gets a Cloudflare login redirect at the edge, and hitting the origin directly
   (`curl -H 'Host: analogracingclub.com' localhost/api/admin/series`) is refused with 403.

## Deploy (behind the connorcantrell.com foundation)

Runs as a Docker Compose stack on the Orange Pi; Cloudflare Tunnel → Caddy → `localhost:8004`.
`analogracingclub.com` is its own Cloudflare zone, so it needs its own tunnel ingress and DNS.

```sh
./scripts/deploy.sh      # rsync -> /srv/apps/analogracingclub, docker compose up -d --build
./scripts/add-route.sh   # tunnel ingress + Caddy block + DNS instructions for analogracingclub.com
```

`deploy.sh` refuses to run unless the deploy dir's `.env` configures admin auth (the
`CF_ACCESS_*` pair, or `ADMIN_PASSWORD`).
`add-route.sh` adds `analogracingclub.com` + `www` to the tunnel ingress (repo template and
`/etc/cloudflared/config.yml`), a Caddy site block (www → apex redirect), reloads both, then
creates the zone's CNAMEs via `cloudflared tunnel route dns` or prints the two records to add
in the dashboard (`@` and `www` → `<TUNNEL_UUID>.cfargotunnel.com`, proxied).

**Rollback:** remove the Caddy block + ingress rules and reload; `docker compose down` (the
`mongo-data` and `round-images` volumes are retained).

**Backup:** state lives in two volumes — `mongo-data` (results, series, drivers) and
`round-images` (admin-uploaded race photos). Back up both.
```sh
# Database
docker compose exec mongo mongodump --db arc --archive | gzip > arc-$(date +%F).gz
# Uploaded photos
docker run --rm -v analogracingclub_round-images:/src -v "$PWD":/out alpine \
  tar czf /out/arc-photos-$(date +%F).tgz -C /src .
```

> `docker compose down -v` destroys both volumes, photos included. Use plain
> `docker compose down` unless you intend to wipe all state.
