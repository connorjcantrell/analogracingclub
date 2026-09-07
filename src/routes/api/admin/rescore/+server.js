import { json } from '@sveltejs/kit';
import { rescore } from '$lib/server/scoring/rescore.js';
import { resyncDrivers } from '$lib/server/admin/ops.js';

// POST { slug? } — rebuild stored results from raw with each series' current
// points config.
export async function POST({ locals, request }) {
  let body = {};
  try { body = await request.json(); } catch { /* empty body = everything */ }
  const { updated } = await rescore(locals.db, { seriesSlug: body?.slug ?? null });
  const roster = await resyncDrivers(locals.db);
  return json({ ok: true, rescored: updated, drivers: roster });
}
