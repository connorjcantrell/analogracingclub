import { redirect } from '@sveltejs/kit';
import { resultsIndex, legacyEventId } from '$lib/server/results.js';
import { resultsLink } from '$lib/format.js';

// ?season=<slug> narrows the list to one season; absent, every race shows.
// Older links to one event (?event=<id>, ?series=&round=) go to its page.
export async function load({ locals, url }) {
  if (url.searchParams.has('event') || url.searchParams.has('series')) {
    const id = await legacyEventId(locals.db, url);
    if (id != null) redirect(301, resultsLink(id));
  }
  return { results: await resultsIndex(locals.db, url.searchParams.get('season')) };
}
