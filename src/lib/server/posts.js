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

// Resolve chosen carousel urls: only keep ones that still point at a stored
// result photo, so a deleted result can never leave a dangling image, and store
// each with its track/config so the carousel can caption it.
async function resolvePhotos(db, urls) {
  const byUrl = new Map((await listPhotos(db, { limit: Infinity })).map((p) => [p.url, p]));
  return (Array.isArray(urls) ? urls : [])
    .filter((u) => byUrl.has(u))
    .map((u) => ({ url: u, track: byUrl.get(u).track, config: byUrl.get(u).config }));
}

// The editorial fields an admin can set on a stored result's feed post: a
// headline that replaces the automatic one, and a paragraph under it. Trimmed
// and capped; an empty string clears the field.
export function cleanResultPost(body) {
  const out = {};
  if (body?.postTitle !== undefined) out.postTitle = String(body.postTitle ?? '').trim().slice(0, 200);
  if (body?.postBody !== undefined) out.postBody = String(body.postBody ?? '').trim().slice(0, 4000);
  return out;
}

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
  const photos = await resolvePhotos(db, body?.photos);
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

// Edit a schedule post in place: title, intro, rounds and photos. The season it
// announces and its place in the feed (publishedAt) stay as they are. Returns
// { error } on a missing post, else { ok, post }.
export async function updatePost(db, id, body) {
  const { posts } = collections(db);
  const cur = await posts.findOne({ _id: id });
  if (!cur) return { error: 'post not found' };
  const set = {
    title: String(body?.title ?? '').trim() || cur.title,
    intro: String(body?.intro ?? '').trim(),
    rounds: cleanScheduleRows(body?.rounds),
    photos: await resolvePhotos(db, body?.photos),
    updatedAt: new Date(),
  };
  await posts.updateOne({ _id: id }, { $set: set });
  return { ok: true, post: { ...cur, ...set } };
}

export async function deletePost(db, id) {
  const res = await collections(db).posts.deleteOne({ _id: id });
  return { ok: res.deletedCount > 0, deleted: res.deletedCount };
}
