// Read models shared by the page loads and the public JSON API: series as the
// site describes them, an event with its type resolved to a descriptor, and
// a series' rounds merged with its schedule.
import { collections } from './db/index.js';
import { getSeries, listSubsessionsFull, listSpecialEvents } from './api/queries.js';
import { publicDescriptor } from './event-types.js';

// How many qualifying places the series' format actually pays. The ARC
// standard scores the top four ("the Fast Four"); a format that scores no
// qualifying places has no such thing, so the site must not invent one.
const qualifyingPlaces = (s) => Object.keys(s?.pointsConfig?.qualifying?.base ?? {}).length;

export const publicSeries = (s) => {
  const eventType = publicDescriptor(s.eventType);
  return {
    slug: s.slug, name: s.name, status: s.status,
    eventType, typeLabel: eventType.name,
    dropCount: s.dropCount ?? 0,
    // A single-round competition (a special/hosted one-off) has no meaningful
    // round column; the results/home pages collapse on this.
    singleRound: (s.schedule?.length ?? 0) <= 1,
    qualifyingPlaces: qualifyingPlaces(s),
  };
};

// Resolve a stored event's eventType id to its descriptor, so the frontend
// reads the type off the event it is showing. A round filed in a series takes
// the series' type (the container is the source of truth; rounds ingested
// before event types existed carry none of their own).
export const withEventType = (doc, containerType = null) => ({ ...doc, eventType: publicDescriptor(containerType ?? doc.eventType) });

// A series' rounds: schedule merged with the stored results for each round.
export async function seriesRounds(db, s) {
  const docs = await listSubsessionsFull(db, { seriesSlug: s.slug });
  const byRound = new Map();
  for (const r of s.schedule ?? []) byRound.set(r.round, { round: r.round, track: r.track, date: r.date, multiplier: r.multiplier ?? 1, subsessions: [] });
  for (const d of docs) {
    const key = d.round ?? d._id;
    if (!byRound.has(key)) byRound.set(key, { round: key, track: null, date: null, multiplier: 1, subsessions: [] });
    byRound.get(key).subsessions.push(withEventType(d, s.eventType));
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

// The standalone special events, shaped like a series' rounds so the results
// page can render them with the same machinery (each event is its own row).
export async function specialEventsView(db) {
  const docs = await listSpecialEvents(db);
  return {
    series: { name: 'Special events', typeLabel: 'Special events', special: true, singleRound: true },
    rounds: docs.map((d) => ({ round: null, track: null, date: null, multiplier: 1, subsessions: [withEventType(d)] })),
  };
}

// Results view for a series slug, or the specials collection for SPECIAL.
export const SPECIAL_SLUG = '__special__';
export async function resultsView(db, slug) {
  if (slug === SPECIAL_SLUG) return specialEventsView(db);
  const s = slug ? await getSeries(db, slug) : null;
  if (!s) return null;
  return { series: publicSeries(s), rounds: await seriesRounds(db, s) };
}

// The featured photo of the most recent result that has one — the picture
// link previews (Open Graph) show for any page on the site.
export async function latestFeaturedImage(db) {
  const doc = await collections(db).subsessions
    .find({ featuredImage: { $nin: [null, ''] } }, { projection: { featuredImage: 1, track: 1, title: 1 } })
    .sort({ startTime: -1 }).limit(1).next();
  return doc ? { url: doc.featuredImage, alt: doc.title || doc.track?.name || '' } : null;
}

// The most recently run event, league round or special, for the homepage.
export async function latestEvent(db) {
  const doc = await collections(db).subsessions.find({}, { projection: { raw: 0 } }).sort({ startTime: -1 }).limit(1).next();
  if (!doc) return null;
  const s = doc.seriesSlug ? await getSeries(db, doc.seriesSlug) : null;
  return { series: s ? publicSeries(s) : null, subsession: withEventType(doc, s?.eventType) };
}
