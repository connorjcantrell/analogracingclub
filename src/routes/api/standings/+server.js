import { json } from '@sveltejs/kit';
import { getSeries } from '$lib/server/api/queries.js';
import { computeStandings } from '$lib/server/standings/index.js';
import { publicSeries } from '$lib/server/views.js';

export async function GET({ locals, url }) {
  const slug = url.searchParams.get('series');
  const s = slug ? await getSeries(locals.db, slug) : null;
  if (!s) return json({ error: 'series not found' }, { status: 404 });
  return json({ series: publicSeries(s), ...(await computeStandings(locals.db, { seriesSlug: slug })) });
}
