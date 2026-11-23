import { computeStake } from '$lib/server/stake/index.js';
import { listSeasons, publicSeason } from '$lib/server/season.js';
import { pickStakeSeason } from '$lib/server/home.js';

// Stake is per season, a share of every point paid in a season's window,
// so the page picks a season: ?season= when valid, else the one running now,
// else the most recent one that has started, else the newest (the same pick
// the homepage's stake card makes).
export async function load({ locals, url }) {
  const seasons = await listSeasons(locals.db);
  const want = url.searchParams.get('season');
  const pick = seasons.find((s) => s.slug === want) ?? pickStakeSeason(seasons);
  return {
    seasons: seasons.map(publicSeason),
    stake: pick ? await computeStake(locals.db, { seasonSlug: pick.slug }) : null,
  };
}
