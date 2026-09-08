import { listPhotos } from '$lib/server/api/queries.js';
import { latestEvent } from '$lib/server/views.js';

// Season carousel: league rounds only (the promo shouldn't feature a one-off
// special), shuffled for variety on each load.
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export async function load({ locals }) {
  const [latest, photos] = await Promise.all([latestEvent(locals.db), listPhotos(locals.db, { league: true })]);
  return { latest, photos: shuffle(photos) };
}
