import crypto from 'node:crypto';
import { ADMIN_PASSWORD, SESSION_SECRET, SESSION_TTL_MS } from '../config.js';
import { accessConfigured, requireAccess } from './access.js';

// Admin auth for the SvelteKit request event, in order of precedence:
//   1. Cloudflare Access (CF_ACCESS_*) — the edge authenticates the visitor and
//      the origin verifies the forwarded JWT (see access.js).
//   2. Password login — a successful login sets a signed, expiring session
//      cookie (HMAC over the expiry; no server-side session store). Fails
//      closed: any malformed or expired cookie is treated as logged out.
//   3. Dev mode — neither configured: admin routes are allowed ONLY for
//      loopback requests, so the page is testable locally without a password.

export const COOKIE_NAME = 'arc_admin';
export { accessConfigured };

const passwordConfigured = () => ADMIN_PASSWORD.length > 0;

const sign = (s) => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('base64url');

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export function checkPassword(candidate) {
  return passwordConfigured() && safeEqual(candidate ?? '', ADMIN_PASSWORD);
}

export function issueSession() {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifySession(token) {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  if (!safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

// Cookie attributes: HttpOnly + SameSite=Lax (cross-site POSTs never carry it);
// Secure when the request arrived over https at the edge.
export function sessionCookieOptions(event) {
  const secure = (event.request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';
  return { path: '/', httpOnly: true, sameSite: 'lax', maxAge: Math.floor(SESSION_TTL_MS / 1000), secure };
}

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

/**
 * Gate an admin request. Returns { ok: true } when allowed, or { ok: false,
 * status, error }. Access configured → verify the Access JWT (403 otherwise).
 * Password configured → require a valid session cookie (401 otherwise).
 * Neither (dev) → allow loopback only (503 otherwise).
 */
export async function requireAdmin(event) {
  if (accessConfigured()) return requireAccess(event);
  if (!passwordConfigured()) {
    if (isLoopback(event.getClientAddress())) return { ok: true, dev: true };
    return { ok: false, status: 503, error: 'admin login not configured (set ADMIN_PASSWORD)' };
  }
  if (verifySession(event.cookies.get(COOKIE_NAME))) return { ok: true };
  return { ok: false, status: 401, error: 'login required' };
}

// Login throttle: after MAX_FAILS failed attempts from one IP, refuse for LOCK_MS.
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map(); // ip -> { count, until }

// The visitor's address: Cloudflare's header at the edge, the proxy's
// forwarded address behind Caddy, else the socket.
export function clientIp(event) {
  const h = event.request.headers;
  const fwd = h.get('cf-connecting-ip') || h.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || event.getClientAddress() || 'unknown';
}

export function loginLocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (f.until && f.until > Date.now()) return true;
  if (f.until) fails.delete(ip);
  return false;
}

export function recordLogin(ip, ok) {
  if (ok) { fails.delete(ip); return; }
  const f = fails.get(ip) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  fails.set(ip, f);
}
