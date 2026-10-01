import { json } from '@sveltejs/kit';
import { pollAll } from '$lib/server/videos/index.js';

// POST — re-read every followed channel now.
export async function POST({ locals }) {
  const results = await pollAll(locals.db);
  return json({ ok: true, added: results.reduce((n, r) => n + (r.added ?? 0), 0), results });
}
