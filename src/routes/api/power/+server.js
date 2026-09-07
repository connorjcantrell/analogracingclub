import { json } from '@sveltejs/kit';
import { computePowerRanking } from '$lib/server/power/index.js';

// Cross-season driver power ranking, recency-weighted, head-to-head.
export async function GET({ locals, url }) {
  const q = url.searchParams;
  return json(await computePowerRanking(locals.db, {
    seriesSlug: q.get('series'),
    minEvents: q.get('minEvents') ? Number(q.get('minEvents')) : undefined,
  }));
}
