import crypto from 'node:crypto';

// Central runtime config from the environment, with dev-friendly defaults.
// In the Compose stack, MONGO_URL is mongodb://mongo:27017; locally it defaults
// to a Mongo published on localhost.
export const PORT = Number(process.env.PORT ?? 8004);
export const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
export const MONGO_DB = process.env.MONGO_DB ?? 'arc';

// Admin auth, in order of precedence (see requireAdmin):
//   1. Cloudflare Access — set both CF_ACCESS_* and the edge handles login
//      (GitHub via the Zero Trust IdP); the app verifies the forwarded JWT.
//   2. Password login — ADMIN_PASSWORD set, Access unset.
//   3. Dev mode — neither set: admin is permitted ONLY for loopback requests.
export const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN ?? ''; // e.g. connorcantrell.cloudflareaccess.com
export const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD ?? ''; // Access application audience tag
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
// Signs the admin session cookie. Without a configured secret a random one is
// generated per process, so a restart invalidates every session.
export const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS ?? 24 * 7) * 60 * 60 * 1000;

export const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 5_000_000); // 5 MB
