import { getSeries } from '$lib/server/api/queries.js';
import { computeStandings } from '$lib/server/standings/index.js';
import { pickSeries } from '$lib/server/pick.js';
import { publicSeries } from '$lib/server/views.js';

// Standings are per-championship; standalone single sessions have none.
export async function load({ locals, url }) {
  const pick = await pickSeries(locals.db, url);
  if (!pick.slug) return { pick, standings: null };
  const s = await getSeries(locals.db, pick.slug);
  return { pick, standings: { series: publicSeries(s), ...(await computeStandings(locals.db, { seriesSlug: pick.slug })) } };
}
