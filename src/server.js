import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { PORT } from './config.js';
import { getDb, collections } from './db/index.js';
import {
  listSeries, getSeries, listDrivers, listSubsessions, listSubsessionsFull, getSubsession,
} from './api/queries.js';
import { computeStandings } from './standings/index.js';
import { SERIES_TYPES } from './series.js';
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

const publicSeries = (s) => ({ slug: s.slug, name: s.name, type: s.type, typeLabel: SERIES_TYPES[s.type] ?? s.type, status: s.status });

// A series' rounds: schedule merged with the stored results for each round.
async function seriesRounds(db, s) {
  const docs = await listSubsessionsFull(db, { seriesSlug: s.slug });
  const byRound = new Map();
  for (const r of s.schedule ?? []) byRound.set(r.round, { round: r.round, track: r.track, date: r.date, subsessions: [] });
  for (const d of docs) {
    const key = d.round ?? d._id;
    if (!byRound.has(key)) byRound.set(key, { round: key, track: null, date: null, subsessions: [] });
    byRound.get(key).subsessions.push(d);
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
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
  if (seg[1] === 'subsessions') {
    if (seg.length === 2) return sendJson(res, 200, await listSubsessions(db, { seriesSlug: q.get('series') })), true;
    const sub = await getSubsession(db, decodeURIComponent(seg[2]));
    return sub ? sendJson(res, 200, sub) : sendJson(res, 404, { error: 'subsession not found' }), true;
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
  if (seg[1] === 'latest') {
    // The most recently run event across every series, for the homepage.
    const doc = await collections(db).subsessions.find({}, { projection: { raw: 0 } }).sort({ startTime: -1 }).limit(1).next();
    if (!doc) return sendJson(res, 404, { error: 'no events yet' }), true;
    const s = await getSeries(db, doc.seriesSlug);
    return sendJson(res, 200, { series: s ? publicSeries(s) : null, subsession: doc }), true;
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
