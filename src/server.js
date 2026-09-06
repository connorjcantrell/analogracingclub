import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { PORT } from './config.js';
import { getDb, collections } from './db/index.js';
import {
  listSeries, getSeries, listDrivers, listSubsessions, listSubsessionsFull, getSubsession, listSpecialEvents, listPhotos,
} from './api/queries.js';
import { computeStandings } from './standings/index.js';
import { computePowerRanking, computeRivals, computeMatchup } from './power/index.js';
import { publicDescriptor } from './event-types.js';
import {
  requireAdmin, checkPassword, issueSession, sessionCookie, clearCookie,
  clientIp, loginLocked, recordLogin,
} from './admin/auth.js';
import { handleAdminApi, readBody } from './admin/routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const ADMIN_DIR = join(__dirname, 'admin');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const redirect = (res, location, headers = {}) => {
  res.writeHead(303, { location, ...headers });
  res.end();
};
async function sendHtml(res, file, status = 200, headers = {}) {
  const html = await readFile(join(ADMIN_DIR, file));
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(html);
}

// How many qualifying places the series' format actually pays. The ARC
// standard scores the top four ("the Fast Four"); a format that scores no
// qualifying places has no such thing, so the site must not invent one.
const qualifyingPlaces = (s) => Object.keys(s?.pointsConfig?.qualifying?.base ?? {}).length;
const publicSeries = (s) => {
  const eventType = publicDescriptor(s.eventType);
  return {
    slug: s.slug, name: s.name, status: s.status,
    eventType, typeLabel: eventType.name,
    dropCount: s.dropCount ?? 0,
    // A single-round competition (a special/hosted one-off) has no meaningful
    // round column; the results/home pages collapse on this.
    singleRound: (s.schedule?.length ?? 0) <= 1,
    qualifyingPlaces: qualifyingPlaces(s),
  };
};

// Resolve a stored event's eventType id to its descriptor, so the frontend
// reads the type off the event it is showing.
const withEventType = (doc) => ({ ...doc, eventType: publicDescriptor(doc.eventType) });

// A series' rounds: schedule merged with the stored results for each round.
async function seriesRounds(db, s) {
  const docs = await listSubsessionsFull(db, { seriesSlug: s.slug });
  const byRound = new Map();
  for (const r of s.schedule ?? []) byRound.set(r.round, { round: r.round, track: r.track, date: r.date, multiplier: r.multiplier ?? 1, subsessions: [] });
  for (const d of docs) {
    const key = d.round ?? d._id;
    if (!byRound.has(key)) byRound.set(key, { round: key, track: null, date: null, multiplier: 1, subsessions: [] });
    byRound.get(key).subsessions.push(withEventType(d));
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

// The standalone special events, shaped like a series' rounds so the results
// page can render them with the same machinery (each event is its own row).
async function specialEventsView(db) {
  const docs = await listSpecialEvents(db);
  return {
    series: { name: 'Special events', typeLabel: 'Special events', special: true, singleRound: true },
    rounds: docs.map((d) => ({ round: null, track: null, date: null, multiplier: 1, subsessions: [withEventType(d)] })),
  };
}

async function handleApi(db, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const q = url.searchParams;

  if (seg[1] === 'series') {
    if (seg.length === 2) return sendJson(res, 200, (await listSeries(db, { status: q.get('status') })).map(publicSeries)), true;
    const s = await getSeries(db, seg[2]);
    return s ? sendJson(res, 200, { ...publicSeries(s), schedule: s.schedule, format: s.format, pointsConfig: s.pointsConfig }) : sendJson(res, 404, { error: 'series not found' }), true;
  }
  if (seg[1] === 'drivers') return sendJson(res, 200, await listDrivers(db)), true;
  // Each driver's most-contested rival and their direct 1v1 record per metric.
  if (seg[1] === 'power' && seg[2] === 'rivals') {
    return sendJson(res, 200, await computeRivals(db, { seriesSlug: q.get('series') })), true;
  }
  // The race-by-race head-to-head between two drivers.
  if (seg[1] === 'power' && seg[2] === 'matchup') {
    const a = Number(q.get('a'));
    const b = Number(q.get('b'));
    if (!Number.isInteger(a) || !Number.isInteger(b)) return sendJson(res, 400, { error: 'a and b (cust ids) required' }), true;
    return sendJson(res, 200, await computeMatchup(db, a, b)), true;
  }
  // Cross-season driver power ranking, recency-weighted, head-to-head.
  if (seg[1] === 'power') {
    return sendJson(res, 200, await computePowerRanking(db, {
      seriesSlug: q.get('series'),
      minEvents: q.get('minEvents') ? Number(q.get('minEvents')) : undefined,
    })), true;
  }
  if (seg[1] === 'subsessions') {
    if (seg.length === 2) return sendJson(res, 200, await listSubsessions(db, { seriesSlug: q.get('series') })), true;
    const sub = await getSubsession(db, decodeURIComponent(seg[2]));
    return sub ? sendJson(res, 200, sub) : sendJson(res, 404, { error: 'subsession not found' }), true;
  }
  // Standalone special events, grouped as one "Special events" collection.
  if (seg[1] === 'special-events') return sendJson(res, 200, await listSpecialEvents(db)), true;
  if (seg[1] === 'results' && q.get('special') === '1') {
    return sendJson(res, 200, await specialEventsView(db)), true;
  }
  if (seg[1] === 'standings' || seg[1] === 'results') {
    const slug = q.get('series');
    const s = slug ? await getSeries(db, slug) : null;
    if (!s) return sendJson(res, 404, { error: 'series not found' }), true;
    if (seg[1] === 'standings') {
      return sendJson(res, 200, { series: publicSeries(s), ...(await computeStandings(db, { seriesSlug: slug })) }), true;
    }
    return sendJson(res, 200, { series: publicSeries(s), rounds: await seriesRounds(db, s) }), true;
  }
  // Every race photo attached to a result, for the homepage carousel.
  if (seg[1] === 'photos') {
    return sendJson(res, 200, await listPhotos(db, { limit: q.get('limit') ? Number(q.get('limit')) : undefined })), true;
  }
  if (seg[1] === 'latest') {
    // The most recently run event, league round or special, for the homepage.
    const doc = await collections(db).subsessions.find({}, { projection: { raw: 0 } }).sort({ startTime: -1 }).limit(1).next();
    if (!doc) return sendJson(res, 404, { error: 'no events yet' }), true;
    const s = doc.seriesSlug ? await getSeries(db, doc.seriesSlug) : null;
    return sendJson(res, 200, { series: s ? publicSeries(s) : null, subsession: withEventType(doc) }), true;
  }
  return false;
}

// Login form + session cookie handling. Returns true if handled.
async function handleAdminPages(db, req, res, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/';

  if (p === '/admin/login') {
    if (req.method === 'POST') {
      const ip = clientIp(req);
      if (loginLocked(ip)) return redirect(res, '/admin/login?error=locked'), true;
      const form = new URLSearchParams(await readBody(req, 10_000));
      const ok = checkPassword(form.get('password'));
      recordLogin(ip, ok);
      if (!ok) return redirect(res, '/admin/login?error=1'), true;
      return redirect(res, '/admin', { 'set-cookie': sessionCookie(issueSession(), req) }), true;
    }
    if (requireAdmin(req).ok) return redirect(res, '/admin'), true;
    await sendHtml(res, 'login.html');
    return true;
  }
  if (p === '/admin/logout' && req.method === 'POST') {
    return redirect(res, '/admin/login', { 'set-cookie': clearCookie() }), true;
  }
  if (p === '/admin') {
    const gate = requireAdmin(req);
    if (gate.ok) { await sendHtml(res, 'admin.html'); return true; }
    if (gate.status === 401) return redirect(res, '/admin/login'), true;
    res.writeHead(gate.status, { 'content-type': 'text/plain' }).end(gate.error);
    return true;
  }
  return false;
}

async function serveStatic(res, url) {
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  // Extensionless pretty URLs (e.g. /standings) map to the matching .html file.
  const candidate = normalize(join(PUBLIC_DIR, rel));
  const filePath = extname(candidate) ? candidate : `${candidate}.html`;
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

const db = await getDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/admin/')) {
      const gate = requireAdmin(req);
      if (!gate.ok) return sendJson(res, gate.status, { error: gate.error });
      if (!(await handleAdminApi(db, req, res, url))) sendJson(res, 404, { error: 'unknown admin endpoint' });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!(await handleApi(db, res, url))) sendJson(res, 404, { error: 'unknown endpoint' });
      return;
    }
    if (await handleAdminPages(db, req, res, url)) return;
    await serveStatic(res, url);
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`analogracingclub listening on http://localhost:${PORT}`));
