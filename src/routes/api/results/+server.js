import { json } from '@sveltejs/kit';
import { resultsView, SPECIAL_SLUG } from '$lib/server/views.js';

export async function GET({ locals, url }) {
  const slug = url.searchParams.get('special') === '1' ? SPECIAL_SLUG : url.searchParams.get('series');
  const view = await resultsView(locals.db, slug);
  return view ? json(view) : json({ error: 'series not found' }, { status: 404 });
}
