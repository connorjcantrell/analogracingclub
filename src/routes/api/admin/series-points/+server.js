import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { FORMATS, pointsConfigFor, validatePointsConfig } from '$lib/server/scoring/formats.js';
import { rescore } from '$lib/server/scoring/rescore.js';
import { readJson } from '$lib/server/admin/ops.js';

// POST { slug, format } | { slug, pointsConfig } — switch a series to a preset
// or a custom config, then rescore it.
export async function POST({ locals, request }) {
  const { series } = collections(locals.db);
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const { slug } = body ?? {};
  if (!slug) return json({ error: 'slug required' }, { status: 400 });
  let set;
  if (body.pointsConfig != null) {
    try { set = { format: 'custom', pointsConfig: validatePointsConfig(body.pointsConfig) }; }
    catch (e) { return json({ error: `invalid pointsConfig: ${e.message}` }, { status: 400 }); }
  } else if (FORMATS[body.format]) {
    set = { format: body.format, pointsConfig: pointsConfigFor(body.format) };
  } else {
    return json({ error: 'format (preset id) or pointsConfig required' }, { status: 400 });
  }
  const upd = await series.updateOne({ slug }, { $set: set });
  if (!upd.matchedCount) return json({ error: 'series not found' }, { status: 404 });
  const { updated } = await rescore(locals.db, { seriesSlug: slug });
  return json({ ok: true, slug, format: set.format, rescored: updated });
}
