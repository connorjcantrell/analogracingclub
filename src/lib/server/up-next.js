// "Up next" for the homepage: the first unrun round of the active series (or
// of the next upcoming one), with the schedule row's track, date, optional
// event link and 2:1 image. The banner links to the event page, falling back
// to the Discord invite.
import { collections } from './db/index.js';
import { resolveEventType } from './event-types.js';

export async function buildUpNext(db) {
  const { series, subsessions } = collections(db);
  const all = await series.find({}).sort({ createdAt: -1 }).toArray();
  const active = all.filter((s) => s.status === 'active');
  const upcoming = all.filter((s) => s.status === 'upcoming');
  for (const s of [...active, ...upcoming]) {
    const run = new Set((await subsessions.find({ seriesSlug: s.slug }, { projection: { round: 1 } }).toArray()).map((d) => d.round));
    const row = (s.schedule ?? []).find((r) => !run.has(r.round));
    if (row) {
      return {
        // A league season is named; anything hosted reads as a special event.
        series: { slug: s.slug, name: s.name, car: s.car ?? null, kind: resolveEventType(s.eventType).category === 'league' ? s.name : 'Special event' },
        round: row.round,
        track: row.track ?? null, date: row.date ?? null, startTime: row.startTime ?? null, link: row.link ?? null, image: row.image ?? null,
        multiplier: row.multiplier ?? 1,
      };
    }
  }
  return null;
}
