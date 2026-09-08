import { json } from '@sveltejs/kit';
import { listSubsessions } from '$lib/server/api/queries.js';

export async function GET({ locals, url }) {
  return json(await listSubsessions(locals.db, { seriesSlug: url.searchParams.get('series') }));
}
