import { collections } from './db/index.js';
import { listSeries } from './api/queries.js';
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
export const KINDS = [
  { id: 'league', label: 'League Sessions' },
  { id: 'single', label: 'Single Sessions' },
  { id: 'special', label: 'Special Events' },
];

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
