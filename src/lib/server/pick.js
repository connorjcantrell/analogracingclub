import { listSeries, listSpecialEvents, latestRaceBySeries } from './api/queries.js';
import { publicSeries, SPECIAL_SLUG } from './views.js';

// The default season/series when the URL names none: the active season that
// raced most recently, so a fresh result promotes its season to the front.
// Falls back to the first active season that hasn't raced yet, then — when no
// season is active — to whichever season raced most recently, then list order.
async function defaultSlug(db, containers) {
  if (!containers.length) return null;
  const latest = await latestRaceBySeries(db);
  const active = containers.filter((s) => s.status === 'active');
  const pool = active.length ? active : containers;
  // Stable sort keeps listSeries order (active first, newest-created) as the
  // tiebreak when seasons haven't raced or share a most-recent race.
  const ranked = [...pool].sort((a, b) => (latest.get(b.slug) ?? '').localeCompare(latest.get(a.slug) ?? ''));
  return ranked[0].slug;
}

// The series a standings/results page shows: ?series= when valid, else the
// default season above, else the specials collection (results only). Returns
// the picker's choices alongside the pick.
export async function pickSeries(db, url, { includeSpecial = true } = {}) {
  const containers = (await listSeries(db)).map(publicSeries);
  const hasSpecial = includeSpecial && (await listSpecialEvents(db)).length > 0;
  const values = [...containers.map((s) => s.slug), ...(hasSpecial ? [SPECIAL_SLUG] : [])];
  const want = url.searchParams.get('series');
  const slug = !values.length ? null
    : values.includes(want) ? want
    : (await defaultSlug(db, containers)) ?? SPECIAL_SLUG;
  return { containers, hasSpecial, slug };
}
