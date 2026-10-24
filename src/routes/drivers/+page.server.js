import { getSeries } from '$lib/server/api/queries.js';
import { computeStake } from '$lib/server/stake/index.js';
import { pickSeries } from '$lib/server/pick.js';
import { publicSeries } from '$lib/server/views.js';

// Stake is per-championship — a share of a season's points — so the page
// picks a series like the standings do; standalone special events have none.
export async function load({ locals, url }) {
  const pick = await pickSeries(locals.db, url, { includeSpecial: false });
  if (!pick.slug) return { pick, stake: null };
  const s = await getSeries(locals.db, pick.slug);
  return { pick, stake: { series: publicSeries(s), ...(await computeStake(locals.db, { seriesSlug: pick.slug })) } };
}
