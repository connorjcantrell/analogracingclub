import { json } from '@sveltejs/kit';
import { computeRivals } from '$lib/server/power/index.js';

// Each driver's most-contested rival and their direct 1v1 record per metric.
export async function GET({ locals, url }) {
  return json(await computeRivals(locals.db, { seriesSlug: url.searchParams.get('series') }));
}
