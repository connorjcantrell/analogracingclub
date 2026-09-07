import { json } from '@sveltejs/kit';
import { listPhotos } from '$lib/server/api/queries.js';

// Every race photo attached to a result; ?league=1 keeps only series rounds.
export async function GET({ locals, url }) {
  const q = url.searchParams;
  return json(await listPhotos(locals.db, { limit: q.get('limit') ? Number(q.get('limit')) : undefined, league: q.get('league') === '1' }));
}
