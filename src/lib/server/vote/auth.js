import crypto from 'node:crypto';
import { SESSION_SECRET } from '../config.js';

// Voter auth for the hidden /vote page: each driver gets a random passcode,
// generated on /admin/vote and handed out privately (Discord DM). Entering it
// on /vote sets a signed, expiring cookie carrying the driver's custId — no
// account, no OAuth. Codes live in the voteCodes collection (see ./index.js);
// this module only does the cookie and the code format.

export const VOTER_COOKIE = 'arc_vote';
const VOTER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // outlives any 3-day vote

const sign = (s) => crypto.createHmac('sha256', `vote:${SESSION_SECRET}`).update(s).digest('base64url');

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Passcodes read over voice and survive phone keyboards: 8 characters from an
// alphabet with no 0/O, 1/I/L lookalikes, split XXXX-XXXX.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() {
  const bytes = crypto.randomBytes(8);
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Typed codes match loosely: case, spaces, and the dash don't matter. */
export const normalizeCode = (raw) =>
  String(raw ?? '').toUpperCase().replace(/[^A-Z2-9]/g, '');

// Cookie attributes mirror the admin session's (HttpOnly, Lax, Secure behind
// https at the edge).
export function voterCookieOptions(event) {
  const secure = (event.request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https'
    || event.url.protocol === 'https:';
  return { path: '/', httpOnly: true, sameSite: 'lax', maxAge: Math.floor(VOTER_TTL_MS / 1000), secure };
}

export function issueVoterSession(custId) {
  const body = Buffer.from(JSON.stringify({ custId, exp: Date.now() + VOTER_TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** The signed-in driver's custId, or null. Malformed/expired reads as logged out. */
export function getVoter(event) {
  const token = event.cookies.get(VOTER_COOKIE);
  if (!token) return null;
  const i = token.indexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  if (!safeEqual(token.slice(i + 1), sign(body))) return null;
  try {
    const { custId, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (custId == null || Number(exp) < Date.now()) return null;
    return { custId };
  } catch {
    return null;
  }
}
