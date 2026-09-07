import { json } from '@sveltejs/kit';
import { getSeries } from '$lib/server/api/queries.js';
import { publicSeries } from '$lib/server/views.js';

export async function GET({ locals, params }) {
  const s = await getSeries(locals.db, params.slug);
  if (!s) return json({ error: 'series not found' }, { status: 404 });
  return json({ ...publicSeries(s), schedule: s.schedule, format: s.format, pointsConfig: s.pointsConfig });
}
