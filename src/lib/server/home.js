// The homepage: three cards in a row, the latest race's top five, the
// championship's top five and the stake's top five, with a strip of the
// newest race photos and videos beneath. (The feed it replaced lives on in
// feed.js for /api/feed.)
import { collections } from './db/index.js';
import { listSeries } from './api/queries.js';
import { resultsIndex } from './results.js';
import { computeStandings } from './standings/index.js';
import { computeStake } from './stake/index.js';
import { listSeasons } from './season.js';
import { seasonAt } from '../seasons.js';
import { resolveEventType } from './event-types.js';
import { publicSeries } from './views.js';
import { listVideosPublic } from './videos/index.js';
import { KIND_NAMES, eventTitle, resultsLink, session } from '../format.js';

export const TOP = 5;
export const MEDIA = 10;

/** A race's photo for the page: the one marked featured, else its first upload, else null. */
export const heroOf = (doc) => doc?.featuredImage || doc?.images?.[0]?.url || null;

/** The most recent race the club has run, as the results page shapes it, or null. */
export async function latestResult(db) {
  const { events } = await resultsIndex(db);
  return events[0] ?? null;
}

/**
 * Pure. The cleanest driver of a race: the fewest incidents per lap across
 * the event's races (its heat and feature together) among the drivers who
 * completed the deciding race, meaning iRacing had them still running at the
 * flag, or, on a result filed before that was kept, on the winner's lap
 * count. Ties go to the driver who ran more laps, then the better finish.
 * Corners per lap are one figure for the whole event, so per lap orders the
 * field exactly as the stake's per corner would. Null when nobody completed
 * the race (or there was none).
 *   { custId, name, incidents, laps }
 */
export function cleanestOf(sub) {
  const deciding = session(sub, 'feature') ?? session(sub, 'sprint');
  if (!deciding) return null;
  const rows = deciding.results ?? [];
  const winnerLaps = rows.find((r) => r.finish === 1)?.lapsComplete ?? 0;
  const completed = (r) => (r.reasonOut != null ? /^running$/i.test(r.reasonOut) : (r.lapsComplete ?? 0) >= winnerLaps && winnerLaps > 0);
  const finishOf = new Map(rows.filter(completed).map((r) => [r.custId, r.finish ?? Infinity]));
  const tally = new Map();
  for (const s of sub?.simsessions ?? []) {
    if (s.kind !== 'feature' && s.kind !== 'sprint') continue;
    for (const r of s.results ?? []) {
      if (!finishOf.has(r.custId)) continue;
      const t = tally.get(r.custId) ?? { custId: r.custId, name: r.displayName, incidents: 0, laps: 0 };
      t.incidents += r.incidents ?? 0;
      t.laps += r.lapsComplete ?? 0;
      tally.set(r.custId, t);
    }
  }
  const rate = (t) => t.incidents / t.laps;
  return [...tally.values()].filter((t) => t.laps > 0)
    .sort((a, b) => rate(a) - rate(b) || b.laps - a.laps || finishOf.get(a.custId) - finishOf.get(b.custId))[0] ?? null;
}

/**
 * Pure. Which championship the homepage shows: the current season's, once it
 * has run a round; until then the season before's, and so on back. With no
 * season-filed championship raced, the one that raced most recently. Null
 * when no championship has raced at all.
 *   seasons   — every season (any order)
 *   series    — series docs (slug, season, eventType, status)
 *   roundsRun — Map slug → distinct rounds with a result
 *   latest    — Map slug → latest race start time (ISO)
 */
export function pickChampionship({ seasons, series, roundsRun, latest = new Map(), now = new Date() }) {
  const champs = series.filter((s) => resolveEventType(s.eventType).category === 'league');
  const raced = (s) => (roundsRun.get(s.slug) ?? 0) > 0;
  const bySeason = new Map(champs.map((s) => [s.season, s]));
  const newestFirst = [...seasons].sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  const current = seasonAt(seasons, now);
  const from = current ? newestFirst.findIndex((s) => s.slug === current.slug) : 0;
  for (const season of newestFirst.slice(from)) {
    const s = bySeason.get(season.slug);
    if (s && raced(s)) return s;
  }
  return champs.filter(raced).sort((a, b) => (latest.get(b.slug) ?? '').localeCompare(latest.get(a.slug) ?? ''))[0] ?? null;
}

/** Distinct rounds with a stored result, per series slug. */
async function roundsRunBySeries(db) {
  const rows = await collections(db).subsessions.aggregate([
    { $match: { seriesSlug: { $ne: null } } },
    { $group: { _id: { s: '$seriesSlug', r: '$round' } } },
    { $group: { _id: '$_id.s', n: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/**
 * The championship card: the series, its season, how far through its
 * schedule it is, and its top ten. Null when no championship has raced.
 */
export async function championship(db) {
  const [seasons, series, roundsRun] = await Promise.all([listSeasons(db), listSeries(db), roundsRunBySeries(db)]);
  const s = pickChampionship({ seasons, series, roundsRun });
  if (!s) return null;
  const { standings } = await computeStandings(db, { seriesSlug: s.slug });
  const run = roundsRun.get(s.slug) ?? 0;
  return {
    series: publicSeries(s),
    seasonName: seasons.find((x) => x.slug === s.season)?.name ?? null,
    roundsRun: run,
    roundsTotal: Math.max(s.schedule?.length ?? 0, run),
    standings: standings.slice(0, TOP).map(({ custId, displayName, total, change }) => ({ custId, displayName, total, change })),
  };
}

/**
 * Pure. Which season the stake card (and the stake page) shows: the one
 * running now, else the most recent one that has started, else the newest.
 * Null with no seasons.
 */
export function pickStakeSeason(seasons, now = Date.now()) {
  const t = new Date(now).getTime();
  return seasonAt(seasons, t)
    ?? seasons.find((s) => new Date(s.startsAt).getTime() <= t)
    ?? seasons[0] ?? null;
}

/**
 * The stake card: the season, how many sessions have counted, and the top
 * five on stake. A driver under the race minimum holds none and sits out.
 * Null when no season has run a session.
 */
export async function stakeTop(db) {
  const seasons = await listSeasons(db);
  const season = pickStakeSeason(seasons);
  if (!season) return null;
  const st = await computeStake(db, { seasonSlug: season.slug });
  if (!st.steps.length) return null;
  return {
    season: st.season,
    races: st.steps.length,
    drivers: st.drivers.filter((x) => x.eligible).slice(0, TOP)
      .map(({ custId, displayName, stake, change, posChange }) => ({ custId, displayName, stake, change, posChange })),
  };
}

/**
 * Pure. The media strip: every race's photo (the featured one, else its
 * first) and every race video, as one list newest first, capped at MEDIA.
 * A photo tile links to its race; a video tile carries its YouTube id.
 */
export function mediaItems({ events, videos }) {
  const photos = events.filter((e) => heroOf(e.sub)).map((e) => ({
    key: `photo:${e.id}`, kind: 'photo', date: e.startTime, image: heroOf(e.sub), href: resultsLink(e.id),
    caption: [e.seriesName ?? KIND_NAMES[e.kind], eventTitle(e)].filter(Boolean).join(' · '),
  }));
  const vids = videos.map((v) => ({
    key: `video:${v.id}`, kind: 'video', id: v.id, date: v.publishedAt, image: v.thumbnail, href: v.url, title: v.title,
    caption: v.event
      ? [v.event.series ?? 'Single session', v.event.round != null ? `Round ${v.event.round}` : v.event.title, v.event.track].filter(Boolean).join(' · ')
      : v.title,
  }));
  const at = (m) => new Date(m.date ?? NaN).getTime();
  return [...photos, ...vids].filter((m) => !Number.isNaN(at(m))).sort((a, b) => at(b) - at(a)).slice(0, MEDIA)
    .map((m) => ({ ...m, date: new Date(m.date).toISOString() }));
}

/** The media strip's items from the database. */
export async function mediaStrip(db) {
  const [{ events }, videos] = await Promise.all([resultsIndex(db), listVideosPublic(db)]);
  return mediaItems({ events, videos });
}
