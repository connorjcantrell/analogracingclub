import { json } from '@sveltejs/kit';
import { listSeries } from '$lib/server/api/queries.js';
import { publicSeries } from '$lib/server/views.js';

export async function GET({ locals, url }) {
  return json((await listSeries(locals.db, { status: url.searchParams.get('status') })).map(publicSeries));
}
