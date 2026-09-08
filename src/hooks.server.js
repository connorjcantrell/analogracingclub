import { redirect, json, text } from '@sveltejs/kit';
import { building } from '$app/environment';
import { getDb, closeDb } from '$lib/server/db/index.js';
import { requireAdmin } from '$lib/server/admin/auth.js';

// The old static site lived at /standings.html and friends; links in the
// wild (and Discord) still point there.
const LEGACY = { '/index.html': '/', '/standings.html': '/standings', '/results.html': '/results', '/drivers.html': '/drivers', '/about.html': '/about' };

// Everything under /admin and /api/admin is gated, except the login/logout
// endpoints that establish or end a session.
const OPEN = new Set(['/admin/login', '/admin/logout']);

// adapter-node closes the HTTP server on SIGTERM/SIGINT and then waits for
// the app to release what keeps the event loop alive — the Mongo client.
process.on('sveltekit:shutdown', async () => { await closeDb(); });

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const path = event.url.pathname.replace(/\/+$/, '') || '/';
  if (LEGACY[path]) redirect(301, `${LEGACY[path]}${event.url.search}`);

  // Prerendering (the About page) needs no database.
  if (!building) event.locals.db = await getDb();

  const adminPage = path === '/admin' || path.startsWith('/admin/');
  const adminApi = path.startsWith('/api/admin/');
  if ((adminPage || adminApi) && !OPEN.has(path)) {
    const gate = await requireAdmin(event);
    event.locals.admin = gate;
    if (!gate.ok) {
      if (adminApi) return json({ error: gate.error }, { status: gate.status });
      if (gate.status === 401) redirect(303, '/admin/login');
      return text(gate.error, { status: gate.status });
    }
  }
  return resolve(event);
}
