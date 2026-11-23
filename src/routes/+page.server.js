import { latestResult, cleanestOf, championship, stakeTop, mediaStrip, TOP } from '$lib/server/home.js';

// The homepage: the latest race's top five, the championship's top five and
// the stake's top five, each linking to its full page, then the newest race
// photos and videos.
export async function load({ locals }) {
  const [latest, champ, stake, media] = await Promise.all([
    latestResult(locals.db),
    championship(locals.db),
    stakeTop(locals.db),
    mediaStrip(locals.db),
  ]);
  return { latest, cleanest: latest ? cleanestOf(latest.sub) : null, championship: champ, stake, media, top: TOP };
}
