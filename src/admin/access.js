import crypto from 'node:crypto';
import { CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD } from '../config.js';

// Cloudflare Access at the origin (same scheme as the league site): Access
// challenges the visitor at the edge (GitHub login via the Zero Trust IdP) and
// forwards a signed RS256 JWT in `Cf-Access-Jwt-Assertion`. We verify that
// token here — signature against the team's JWKS, plus audience, issuer and
// expiry — so a request that bypasses the edge (e.g. hits the tunnel with a
// forged header) is still rejected. Fails closed.

export const accessConfigured = () => Boolean(CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD);

const certsUrl = (team) => `https://${team}/cdn-cgi/access/certs`;

let jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getKeys() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(certsUrl(CF_ACCESS_TEAM_DOMAIN));
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

const decodeSegment = (seg) => JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));

/**
 * Verify an Access token. Resolves to the payload on success; throws on any
 * failure (the caller denies). `opts` lets tests inject keys/team/aud instead
 * of hitting the network.
 */
export async function verifyAccessToken(token, opts = {}) {
  const team = opts.team ?? CF_ACCESS_TEAM_DOMAIN;
  const aud = opts.aud ?? CF_ACCESS_AUD;
  if (!token) throw new Error('missing token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeSegment(headerB64);
  const payload = decodeSegment(payloadB64);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');

  const keys = opts.keys ?? (await getKeys());
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), pubKey, Buffer.from(sigB64, 'base64url'));
  if (!ok) throw new Error('bad signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('token expired');
  if (payload.nbf && payload.nbf > now) throw new Error('token not yet valid');
  if (payload.iss !== `https://${team}`) throw new Error('bad issuer');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('bad audience');
  return payload;
}

/** The Access token Cloudflare attached to this request, if any. */
export function accessTokenFrom(req) {
  if (req.headers['cf-access-jwt-assertion']) return req.headers['cf-access-jwt-assertion'];
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === 'CF_Authorization') return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Gate a request via Access. { ok: true, email } or { ok: false, status: 403, error }. */
export async function requireAccess(req) {
  try {
    const payload = await verifyAccessToken(accessTokenFrom(req));
    return { ok: true, email: payload.email };
  } catch (e) {
    return { ok: false, status: 403, error: `access denied: ${e.message}` };
  }
}
