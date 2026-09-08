import { json } from '@sveltejs/kit';
import { buildFeed } from '$lib/server/feed.js';

// GET /api/feed?offset=0&limit=3 — a page of the homepage feed.
export async function GET({ locals, url }) {
  const num = (k, d) => { const n = Number(url.searchParams.get(k)); return Number.isFinite(n) && n >= 0 ? n : d; };
  const offset = num('offset', 0);
  const limit = Math.min(num('limit', 3), 20);
  return json(await buildFeed(locals.db, { offset, limit }));
}
