import { collections } from './db/index.js';
import { listSeries, getSeries } from './api/queries.js';
import { KIND_NAMES } from '../format.js';
import { listSeasons, publicSeason } from './season.js';
import { seasonAt } from '../seasons.js';
import { withEventType } from './views.js';
import { resolveEventType } from './event-types.js';
import { videosByEvent } from './videos/index.js';

// The results page: every race the club has run, newest first, whatever
// season or series it belongs to. A season narrows the list; within it the
// page lets the reader hide any of the three kinds of race.
//
// A race's kind: a round filed in a series is a league session; a standalone
// upload is a single session, or a special event when its event type says so
// (an annual race, say — see event-types.js).
export const KINDS = Object.entries(KIND_NAMES).map(([id, name]) => ({ id, label: `${name}s` }));

export const kindOf = (doc, series) => (series ? 'league' : resolveEventType(doc.eventType).category === 'special' ? 'special' : 'single');

// Newest first. startTime is ISO-8601, so string order is chronological.
const newestFirst = (a, b) => (b.startTime ?? '').localeCompare(a.startTime ?? '') || String(b.id).localeCompare(String(a.id));

// How many qualifying places a series' format pays (the ARC standard scores
// the top four). A standalone's single race already names its winner, so it
// gets none.
const qualifyingPlaces = (s) => Object.keys(s?.pointsConfig?.qualifying?.base ?? {}).length;

/**
 * Pure. Shape stored result docs into the page's events, filed to the season
 * their start time falls in, and list the scheduled rounds still to come.
 *   events   — [{ id, kind, season, seriesSlug, seriesName, round, multiplier,
 *               qualifyingPlaces, startTime, sub }], newest first
 *   upcoming — [{ seriesSlug, seriesName, season, round, track, date }]
 */
export function indexEvents({ docs, series = [], seasons = [], videos = new Map() }) {
  const bySlug = new Map(series.map((s) => [s.slug, s]));
  const run = new Set();
  const events = docs.map((d) => {
    const s = d.seriesSlug ? bySlug.get(d.seriesSlug) ?? null : null;
    const sched = s?.schedule?.find((r) => r.round === d.round) ?? null;
    if (s && d.round != null) run.add(`${s.slug}:${d.round}`);
    return {
      id: d._id,
      kind: kindOf(d, s),
      season: seasonAt(seasons, d.startTime ?? NaN)?.slug ?? null,
      seriesSlug: s?.slug ?? null, seriesName: s?.name ?? null,
      round: s ? d.round ?? null : null,
      multiplier: sched?.multiplier ?? 1,
      qualifyingPlaces: s ? qualifyingPlaces(s) : 0,
      startTime: d.startTime ?? null,
      sub: { ...withEventType(d, s?.eventType), videos: videos.get(d._id) ?? [] },
    };
  }).sort(newestFirst);
  const upcoming = [];
  for (const s of series) {
    for (const r of s.schedule ?? []) {
      if (run.has(`${s.slug}:${r.round}`)) continue;
      upcoming.push({ seriesSlug: s.slug, seriesName: s.name, season: s.season ?? null, round: r.round, track: r.track ?? null, date: r.date ?? null });
    }
  }
  return { events, upcoming };
}

/** The page's data: seasons for the picker, and the events of `seasonSlug` (every event when null or unknown). */
export async function resultsIndex(db, seasonSlug = null) {
  const [docs, series, seasons, videos] = await Promise.all([
    collections(db).subsessions.find({}, { projection: { raw: 0 } }).toArray(),
    listSeries(db),
    listSeasons(db),
    videosByEvent(db),
  ]);
  const season = seasons.some((s) => s.slug === seasonSlug) ? seasonSlug : null;
  const all = indexEvents({ docs, series, seasons, videos });
  return {
    seasons: seasons.map(publicSeason),
    season,
    kinds: KINDS,
    events: season ? all.events.filter((e) => e.season === season) : all.events,
    upcoming: season ? all.upcoming.filter((r) => r.season === season) : all.upcoming,
  };
}

/**
 * Pure. A league round's neighbours in its championship: the round run before
 * it and the one after, each as { id, round, track }, or null at either end.
 * `docs` are the series' result docs; order is by round, then start time.
 */
export function roundNeighbours(docs, id) {
  const byRound = (a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.startTime ?? '').localeCompare(b.startTime ?? '');
  const sorted = [...docs].sort(byRound);
  const i = sorted.findIndex((d) => d._id === id);
  const pick = (d) => (d ? { id: d._id, round: d.round ?? null, track: d.track ?? null } : null);
  return { prev: i > 0 ? pick(sorted[i - 1]) : null, next: i >= 0 ? pick(sorted[i + 1]) : null };
}

/** One event for its own page, or null. A league round also carries its `prev` and `next` rounds. */
export async function resultEvent(db, id) {
  const { subsessions } = collections(db);
  const doc = await subsessions.findOne({ _id: id }, { projection: { raw: 0 } });
  if (!doc) return null;
  const [series, seasons, videos, siblings] = await Promise.all([
    doc.seriesSlug ? getSeries(db, doc.seriesSlug) : null,
    listSeasons(db),
    videosByEvent(db),
    doc.seriesSlug ? subsessions.find({ seriesSlug: doc.seriesSlug }, { projection: { _id: 1, round: 1, track: 1, startTime: 1 } }).toArray() : [],
  ]);
  const { events } = indexEvents({ docs: [doc], series: series ? [series] : [], seasons, videos });
  const ev = events[0];
  const { prev, next } = series ? roundNeighbours(siblings, id) : { prev: null, next: null };
  return { ...ev, seasonName: seasons.find((s) => s.slug === ev.season)?.name ?? null, prev, next };
}

/** The event an older link names (?event=<id>, or ?series=&round=), or null. */
export async function legacyEventId(db, url) {
  const q = url.searchParams;
  if (q.get('event')) return (await collections(db).subsessions.findOne({ _id: q.get('event') }, { projection: { _id: 1 } }))?._id ?? null;
  const round = Number(q.get('round'));
  if (!q.get('series') || !Number.isInteger(round)) return null;
  return (await collections(db).subsessions.findOne({ seriesSlug: q.get('series'), round }, { projection: { _id: 1 } }))?._id ?? null;
}
