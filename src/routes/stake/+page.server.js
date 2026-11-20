import { computeStake } from '$lib/server/stake/index.js';
import { listSeasons, publicSeason, seasonAt } from '$lib/server/season.js';

// Stake is per season, a share of every point paid in a season's window,
// so the page picks a season: ?season= when valid, else the one running now,
// else the most recent one that has started, else the newest.
export async function load({ locals, url }) {
  const seasons = await listSeasons(locals.db);
  const want = url.searchParams.get('season');
  const now = Date.now();
  const pick = seasons.find((s) => s.slug === want)
    ?? seasonAt(seasons, now)
    ?? seasons.find((s) => new Date(s.startsAt).getTime() <= now)
    ?? seasons[0] ?? null;
  return {
    seasons: seasons.map(publicSeason),
    stake: pick ? await computeStake(locals.db, { seasonSlug: pick.slug }) : null,
  };
}
