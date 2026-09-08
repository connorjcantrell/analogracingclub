// Authored homepage posts. Currently one kind: a "schedule" announcement that
// references an upcoming season (series) and carries its own rows of
// { track, config, date } plus a carousel of photos hand-picked from past
// results. Results posts are NOT stored here — the feed derives those from
// subsessions (see src/lib/server/feed.js).
import { collections } from './db/index.js';
import { getSeries, listPhotos } from './api/queries.js';
import { isContainerType } from './event-types.js';

// Coerce admin-supplied schedule rows into storable shape, mirroring
// cleanSchedule in admin/ops.js but with a `config` column and no multiplier
// (a schedule post is editorial, not the scoring schedule). Fully blank rows
// are dropped; each row keeps its own round number.
export const cleanScheduleRows = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r, i) => ({
      round: Number.isInteger(r?.round) ? r.round : i + 1,
      track: r?.track ? String(r.track).trim() || null : null,
      config: r?.config ? String(r.config).trim() || null : null,
      date: r?.date ? String(r.date).trim() || null : null,
    }))
    .filter((r) => r.track || r.config || r.date);

// Every authored post, newest first.
export async function listPosts(db) {
  return collections(db)
    .posts.find({})
    .sort({ publishedAt: -1 })
    .toArray();
}

// Create a schedule post. `now` is injected so the id/timestamps are
// deterministic in tests; the route passes a fresh Date. Returns { error } on
// bad input or { ok, post } on success.
export async function createPost(db, body, now = new Date()) {
  const seriesSlug = String(body?.seriesSlug ?? '').trim();
  if (!seriesSlug) return { error: 'seriesSlug required' };
  const series = await getSeries(db, seriesSlug);
  if (!series) return { error: 'series not found' };
  if (!isContainerType(series.eventType)) return { error: 'series is not a season' };

  const title = String(body?.title ?? '').trim() || series.name;
  const intro = String(body?.intro ?? '').trim();
  const rounds = cleanScheduleRows(body?.rounds);
  // Only keep urls that still point at a stored result photo, so a deleted
  // result can never leave a dangling image in the carousel. Each is stored
  // with its track/config so the carousel can caption it.
  const byUrl = new Map((await listPhotos(db, { limit: Infinity })).map((p) => [p.url, p]));
  const photos = (Array.isArray(body?.photos) ? body.photos : [])
    .filter((u) => byUrl.has(u))
    .map((u) => ({ url: u, track: byUrl.get(u).track, config: byUrl.get(u).config }));
  const publishedAt = body?.publishedAt ? new Date(body.publishedAt) : now;

  const doc = {
    _id: `schedule:${seriesSlug}:${now.getTime()}`,
    type: 'schedule',
    seriesSlug,
    title,
    intro,
    rounds,
    photos,
    createdAt: now,
    publishedAt,
  };
  await collections(db).posts.insertOne(doc);
  return { ok: true, post: doc };
}

export async function deletePost(db, id) {
  const res = await collections(db).posts.deleteOne({ _id: id });
  return { ok: res.deletedCount > 0, deleted: res.deletedCount };
}
