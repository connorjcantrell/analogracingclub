import { resultsIndex } from '$lib/server/results.js';

// ?season=<slug> narrows the list to one season; absent, every race shows.
export async function load({ locals, url }) {
  return { results: await resultsIndex(locals.db, url.searchParams.get('season')) };
}
