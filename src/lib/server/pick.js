import { listSeries, listSpecialEvents } from './api/queries.js';
import { publicSeries, SPECIAL_SLUG } from './views.js';

// The series a standings/results page shows: ?series= when valid, else the
// first active series, else the first series, else the specials collection
// (results only). Returns the picker's choices alongside the pick.
export async function pickSeries(db, url, { includeSpecial = true } = {}) {
  const containers = (await listSeries(db)).map(publicSeries);
  const hasSpecial = includeSpecial && (await listSpecialEvents(db)).length > 0;
  const values = [...containers.map((s) => s.slug), ...(hasSpecial ? [SPECIAL_SLUG] : [])];
  const want = url.searchParams.get('series');
  const slug = !values.length ? null
    : values.includes(want) ? want
    : (containers.find((s) => s.status === 'active') ?? containers[0])?.slug ?? SPECIAL_SLUG;
  return { containers, hasSpecial, slug };
}
