import { collections } from './db/index.js';
import { startEpoch } from '../format.js';
import { seasonAt, seasonWindows, seasonConflict } from '../seasons.js';

export { seasonAt, seasonWindows, seasonConflict };

// Seasons (the `seasons` collection, _id the slug): a start date and an
// optional end, see ../seasons.js for the window rules. Windows never overlap,
// so at any instant at most one season is current. Every uploaded session —
// a league round or a special event — pays its points into the season its
// start time falls in (`stakeSeason` on the subsession, see ./stake) unless
// the admin excluded it at upload (`stakeExcluded`). A series is the
// official "<season> series - <car>" of a season, linked by `series.season`.

export const SEASON_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// A season date is a league-calendar day ("YYYY-MM-DD", from a date picker):
// the window opens or closes at midnight Pacific. Blank → null; unreadable →
// undefined (callers reject it).
export const seasonDate = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const t = startEpoch(`${s.slice(0, 10)}T00:00`);
  return t == null ? undefined : new Date(t);
};

export const publicSeason = (s) => (s ? {
  slug: s._id, name: s.name,
  startsAt: new Date(s.startsAt).toISOString(), endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
} : null);

/** Every season, newest first, each with slug and its effective end. */
export async function listSeasons(db) {
  const rows = await collections(db).seasons.find({}).toArray();
  return seasonWindows(rows.map((s) => ({ ...s, slug: s._id }))).reverse();
}

/** The season running at `at` (now by default), or null. */
export async function currentSeason(db, at = new Date()) {
  return seasonAt(await listSeasons(db), at);
}

/** The season a session's points count toward: none when excluded, else the one its start time falls in. Pure. */
export const stakeSeasonFor = (seasons, { startTime, stakeExcluded }) =>
  (stakeExcluded ? null : seasonAt(seasons, startTime ?? NaN)?.slug ?? null);

/**
 * Re-file every stored session into the season its start time falls in. Run
 * whenever a season is created, moved or deleted (and once at startup, for
 * sessions stored before stake was filed per session). Idempotent; returns
 * how many sessions moved.
 */
export async function refileStake(db) {
  const seasons = await listSeasons(db);
  const { subsessions } = collections(db);
  const ops = [];
  for await (const d of subsessions.find({}, { projection: { startTime: 1, stakeExcluded: 1, stakeSeason: 1 } })) {
    const excluded = d.stakeExcluded === true;
    const season = stakeSeasonFor(seasons, { startTime: d.startTime, stakeExcluded: excluded });
    if (d.stakeExcluded === undefined || (d.stakeSeason ?? null) !== season) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { stakeExcluded: excluded, stakeSeason: season } } } });
    }
  }
  if (ops.length) await subsessions.bulkWrite(ops);
  return ops.length;
}

/** Create a season. Throws an admin-facing message. */
export async function createSeason(db, { name, startsAt, endsAt = null }) {
  const n = String(name ?? '').trim();
  const slug = slugify(n);
  if (!n || !SEASON_SLUG_RE.test(slug)) throw new Error('Name the season (letters or digits), e.g. "Fall 2026".');
  const candidate = { slug, name: n, startsAt, endsAt };
  const conflict = seasonConflict(candidate, await listSeasons(db));
  if (conflict) throw new Error(conflict);
  const { seasons } = collections(db);
  if (await seasons.findOne({ _id: slug })) throw new Error(`A season with the slug ${slug} already exists.`);
  await seasons.insertOne({ _id: slug, name: n, startsAt, endsAt, createdAt: new Date() });
  await refileStake(db);
  return slug;
}

/** Rename or move a season (endsAt null clears the end). Throws an admin-facing message. */
export async function updateSeason(db, slug, { name, startsAt, endsAt } = {}) {
  const { seasons } = collections(db);
  const cur = await seasons.findOne({ _id: slug });
  if (!cur) throw new Error('Season not found.');
  const set = {};
  if (name !== undefined) { const n = String(name).trim(); if (!n) throw new Error('A season needs a name.'); set.name = n; }
  if (startsAt !== undefined) set.startsAt = startsAt;
  if (endsAt !== undefined) set.endsAt = endsAt;
  const candidate = { slug, name: set.name ?? cur.name, startsAt: set.startsAt ?? cur.startsAt, endsAt: 'endsAt' in set ? set.endsAt : cur.endsAt };
  const conflict = seasonConflict(candidate, await listSeasons(db));
  if (conflict) throw new Error(conflict);
  if (Object.keys(set).length) await seasons.updateOne({ _id: slug }, { $set: set });
  await refileStake(db);
  return set;
}

/** Delete a season: its series stay (unassigned) and its sessions re-file. */
export async function deleteSeason(db, slug) {
  const { seasons, series } = collections(db);
  const del = await seasons.deleteOne({ _id: slug });
  if (!del.deletedCount) throw new Error('Season not found.');
  await series.updateMany({ season: slug }, { $set: { season: null } });
  await refileStake(db);
}
