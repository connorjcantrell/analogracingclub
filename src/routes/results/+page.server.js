import { pickSeries } from '$lib/server/pick.js';
import { resultsView } from '$lib/server/views.js';

export async function load({ locals, url }) {
  const pick = await pickSeries(locals.db, url);
  return { pick, results: pick.slug ? await resultsView(locals.db, pick.slug) : null };
}
