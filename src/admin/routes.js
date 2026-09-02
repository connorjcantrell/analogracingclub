import { collections } from '../db/index.js';
import { ingestEventResult } from '../import/ingest.js';
import { getSubsessionRaw } from '../api/queries.js';
import { rescore } from '../scoring/rescore.js';
import { FORMATS, DEFAULT_FORMAT, pointsConfigFor, validatePointsConfig } from '../scoring/formats.js';
import { SERIES_TYPES, SERIES_STATUSES, SLUG_RE } from '../series.js';
import { UPLOAD_MAX_BYTES } from '../config.js';
import { readBuffer, boundaryOf, parseMultipart } from './multipart.js';
import { saveImage, deleteImage, MAX_IMAGE_BYTES } from '../images.js';

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

// Read a request body up to a byte cap; reject if exceeded.
export function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const readJson = async (req, max = 50_000) => JSON.parse(await readBody(req, max));

// Derive a URL slug from a free-text name ("Bathurst 1000" -> "bathurst-1000").
const slugify = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Resync the driver roster from stored results: keep every referenced driver,
// drop the rest (after a delete or rescore).
async function resyncDrivers(db) {
  const { drivers, subsessions } = collections(db);
  const names = new Map();
  for await (const d of subsessions.find({}, { projection: { 'simsessions.results.custId': 1, 'simsessions.results.displayName': 1 } })) {
    for (const sim of d.simsessions ?? []) for (const r of sim.results ?? []) names.set(r.custId, r.displayName);
  }
  if (names.size) {
    await drivers.bulkWrite([...names].map(([custId, displayName]) => ({
      updateOne: { filter: { _id: custId }, update: { $set: { displayName } }, upsert: true },
    })));
  }
  const removed = await drivers.deleteMany({ _id: { $nin: [...names.keys()] } });
  return { kept: names.size, removed: removed.deletedCount };
}

const cleanSchedule = (schedule) => schedule.map((r, i) => ({
  round: Number.isInteger(r?.round) ? r.round : i + 1,
  track: r?.track ? String(r.track) : null,
  date: r?.date ? String(r.date) : null,
}));

// Handle an /api/admin/* request. Caller has already verified access.
// Returns true if handled.
export async function handleAdminApi(db, req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api','admin',...]
  const sub = seg[2];
  const { series, subsessions } = collections(db);

  // GET /api/admin/formats — the named points presets for the create form.
  if (req.method === 'GET' && sub === 'formats') {
    const list = Object.entries(FORMATS).map(([id, f]) => ({ id, name: f.name, description: f.description, pointsConfig: f.pointsConfig }));
    return sendJson(res, 200, { default: DEFAULT_FORMAT, formats: list, types: SERIES_TYPES, statuses: SERIES_STATUSES }), true;
  }

  if (req.method === 'GET' && sub === 'series') {
    const list = await series.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    return sendJson(res, 200, list), true;
  }

  // POST /api/admin/series { slug, name, type, rounds?, format? } — create a series.
  if (req.method === 'POST' && sub === 'series') {
    let body;
    try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: e.message }), true; }
    const slug = String(body?.slug ?? '').trim();
    const name = String(body?.name ?? '').trim();
    const type = body?.type;
    if (!SLUG_RE.test(slug) || !name) return sendJson(res, 400, { error: 'slug (kebab-case) and name required' }), true;
    if (!SERIES_TYPES[type]) return sendJson(res, 400, { error: `type must be one of ${Object.keys(SERIES_TYPES).join(', ')}` }), true;
    const format = body?.format ?? DEFAULT_FORMAT;
    if (!FORMATS[format]) return sendJson(res, 400, { error: 'unknown format' }), true;
    if (await series.findOne({ slug })) return sendJson(res, 409, { error: 'slug already exists' }), true;
    const rounds = Number.isInteger(body?.rounds) && body.rounds > 0 ? body.rounds : type === 'event' ? 1 : 3;
    await series.insertOne({
      slug, name, type, status: 'upcoming',
      schedule: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, track: null, date: null })),
      format, pointsConfig: pointsConfigFor(format),
      createdAt: new Date(),
    });
    return sendJson(res, 200, { ok: true, slug, created: true }), true;
  }

  // POST /api/admin/series-update { slug, name?, status?, schedule? }
  if (req.method === 'POST' && sub === 'series-update') {
    let body;
    try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: e.message }), true; }
    const { slug } = body ?? {};
    if (!slug) return sendJson(res, 400, { error: 'slug required' }), true;
    const set = {};
    if (body.name != null) { const n = String(body.name).trim(); if (!n) return sendJson(res, 400, { error: 'name cannot be empty' }), true; set.name = n; }
    if (body.status != null) { if (!SERIES_STATUSES.includes(body.status)) return sendJson(res, 400, { error: `status must be one of ${SERIES_STATUSES.join(', ')}` }), true; set.status = body.status; }
    if (body.type != null) { if (!SERIES_TYPES[body.type]) return sendJson(res, 400, { error: 'unknown type' }), true; set.type = body.type; }
    if (body.schedule != null) { if (!Array.isArray(body.schedule)) return sendJson(res, 400, { error: 'schedule must be an array' }), true; set.schedule = cleanSchedule(body.schedule); }
    if (!Object.keys(set).length) return sendJson(res, 400, { error: 'nothing to update' }), true;
    const upd = await series.updateOne({ slug }, { $set: set });
    if (!upd.matchedCount) return sendJson(res, 404, { error: 'series not found' }), true;
    return sendJson(res, 200, { ok: true, slug, updated: Object.keys(set) }), true;
  }

  // POST /api/admin/series-points { slug, format } | { slug, pointsConfig } —
  // switch a series to a preset or a custom config, then rescore it.
  if (req.method === 'POST' && sub === 'series-points') {
    let body;
    try { body = await readJson(req); } catch (e) { return sendJson(res, 400, { error: e.message }), true; }
    const { slug } = body ?? {};
    if (!slug) return sendJson(res, 400, { error: 'slug required' }), true;
    let set;
    if (body.pointsConfig != null) {
      try { set = { format: 'custom', pointsConfig: validatePointsConfig(body.pointsConfig) }; }
      catch (e) { return sendJson(res, 400, { error: `invalid pointsConfig: ${e.message}` }), true; }
    } else if (FORMATS[body.format]) {
      set = { format: body.format, pointsConfig: pointsConfigFor(body.format) };
    } else {
      return sendJson(res, 400, { error: 'format (preset id) or pointsConfig required' }), true;
    }
    const upd = await series.updateOne({ slug }, { $set: set });
    if (!upd.matchedCount) return sendJson(res, 404, { error: 'series not found' }), true;
    const { updated } = await rescore(db, { seriesSlug: slug });
    return sendJson(res, 200, { ok: true, slug, format: set.format, rescored: updated }), true;
  }

  // DELETE /api/admin/series/:slug — only when it has no stored results.
  if (req.method === 'DELETE' && sub === 'series' && seg[3]) {
    const slug = decodeURIComponent(seg[3]);
    if (await subsessions.countDocuments({ seriesSlug: slug })) return sendJson(res, 409, { error: 'delete its results first' }), true;
    const del = await series.deleteOne({ slug });
    if (!del.deletedCount) return sendJson(res, 404, { error: 'series not found' }), true;
    return sendJson(res, 200, { ok: true, deleted: slug }), true;
  }

  // POST /api/admin/upload — body: iRacing event-result JSON.
  //   ?series=&round=   file it as a round of an existing series, or
  //   ?event=<name>     file it as a one-off special event, created on the fly
  //                     (unscored, single round).
  if (req.method === 'POST' && sub === 'upload') {
    const eventName = (url.searchParams.get('event') ?? '').trim();
    let slug = url.searchParams.get('series') || null;
    let round = url.searchParams.get('round') ? Number(url.searchParams.get('round')) : null;

    if (eventName) {
      // A special event needs no prior setup: name it here and it is created
      // unscored, with a single round, ready for the result being uploaded.
      slug = slugify(eventName);
      if (!slug) return sendJson(res, 400, { error: 'event name must contain letters or numbers' }), true;
      round = 1;
      const existing = await series.findOne({ slug });
      if (existing && existing.type !== 'event') {
        return sendJson(res, 409, { error: `"${slug}" already exists as a ${existing.type}` }), true;
      }
      if (!existing) {
        await series.insertOne({
          slug, name: eventName, type: 'event', status: 'complete',
          schedule: [{ round: 1, track: null, date: null }],
          format: 'unscored', pointsConfig: pointsConfigFor('unscored'),
          createdAt: new Date(),
        });
      }
    }

    if (!slug) return sendJson(res, 400, { error: 'series or event required' }), true;
    if (!Number.isInteger(round) || round < 1) return sendJson(res, 400, { error: 'round (integer >= 1) required' }), true;
    let json;
    try { json = await readJson(req, UPLOAD_MAX_BYTES); }
    catch (e) { return sendJson(res, 400, { error: `invalid upload: ${e.message}` }), true; }
    try {
      const result = await ingestEventResult(db, json, { seriesSlug: slug, round });
      return sendJson(res, 200, { ok: true, series: slug, ...result }), true;
    } catch (e) {
      return sendJson(res, 400, { error: `ingest failed: ${e.message}` }), true;
    }
  }

  // GET /api/admin/subsessions/:id/download — the stored event JSON as the
  // original `{ type, data }` envelope, as a downloadable attachment.
  if (req.method === 'GET' && sub === 'subsessions' && seg[4] === 'download') {
    const id = decodeURIComponent(seg[3]);
    const envelope = await getSubsessionRaw(db, id);
    if (!envelope) return sendJson(res, 404, { error: 'subsession not found' }), true;
    const safe = id.replace(/[^a-zA-Z0-9_-]+/g, '-');
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="eventresult-${safe}.json"`,
    });
    res.end(JSON.stringify(envelope));
    return true;
  }

  // DELETE /api/admin/subsessions/:id — remove a stored result.
  if (req.method === 'DELETE' && sub === 'subsessions' && seg[3] && !seg[4]) {
    const id = decodeURIComponent(seg[3]);
    const del = await subsessions.deleteOne({ _id: id });
    if (!del.deletedCount) return sendJson(res, 404, { error: 'subsession not found' }), true;
    const roster = await resyncDrivers(db);
    return sendJson(res, 200, { ok: true, deleted: id, drivers: roster }), true;
  }

  // POST /api/admin/subsessions/:id/images — multipart upload of race photos.
  // Appends to the subsession's `images` array; re-uploading a file is a no-op
  // because the stored name is content-addressed.
  if (req.method === 'POST' && sub === 'subsessions' && seg[4] === 'images') {
    const id = decodeURIComponent(seg[3]);
    const doc = await subsessions.findOne({ _id: id }, { projection: { images: 1 } });
    if (!doc) return sendJson(res, 404, { error: 'subsession not found' }), true;
    const boundary = boundaryOf(req.headers['content-type'] ?? '');
    if (!boundary) return sendJson(res, 400, { error: 'expected multipart/form-data' }), true;

    let body;
    try { body = await readBuffer(req, MAX_IMAGE_BYTES * 25); }
    catch (e) { return sendJson(res, 413, { error: e.message }), true; }

    const files = parseMultipart(body, boundary).filter((p) => p.filename && p.data.length);
    if (!files.length) return sendJson(res, 400, { error: 'no image files in upload' }), true;

    const added = [];
    const failed = [];
    for (const f of files) {
      try { added.push(await saveImage(id, f.data, f.filename)); }
      catch (e) { failed.push({ name: f.filename, error: e.message }); }
    }
    if (added.length) {
      const existing = doc.images ?? [];
      const merged = [...existing];
      for (const img of added) if (!merged.some((x) => x.url === img.url)) merged.push(img);
      await subsessions.updateOne({ _id: id }, { $set: { images: merged } });
    }
    return sendJson(res, added.length ? 200 : 400, { ok: added.length > 0, added, failed }), true;
  }

  // PUT /api/admin/subsessions/:id/featured { url } — mark one photo as the
  // round's hero shot (or clear it with a null url).
  if (req.method === 'PUT' && sub === 'subsessions' && seg[4] === 'featured') {
    const id = decodeURIComponent(seg[3]);
    const doc = await subsessions.findOne({ _id: id }, { projection: { images: 1 } });
    if (!doc) return sendJson(res, 404, { error: 'subsession not found' }), true;
    let body = {};
    try { body = await readJson(req, 10_000); } catch { /* empty body clears it */ }
    const target = body?.url ?? null;
    if (target && !(doc.images ?? []).some((x) => x.url === target)) {
      return sendJson(res, 400, { error: 'that photo is not attached to this round' }), true;
    }
    await subsessions.updateOne({ _id: id }, { $set: { featuredImage: target } });
    return sendJson(res, 200, { ok: true, featuredImage: target }), true;
  }

  // DELETE /api/admin/subsessions/:id/images?url= — drop one photo.
  if (req.method === 'DELETE' && sub === 'subsessions' && seg[4] === 'images') {
    const id = decodeURIComponent(seg[3]);
    const target = url.searchParams.get('url');
    if (!target) return sendJson(res, 400, { error: 'url required' }), true;
    const upd = await subsessions.updateOne({ _id: id }, { $pull: { images: { url: target } } });
    if (!upd.matchedCount) return sendJson(res, 404, { error: 'subsession not found' }), true;
    // Never leave the hero pointing at a photo that no longer exists.
    await subsessions.updateOne({ _id: id, featuredImage: target }, { $set: { featuredImage: null } });
    await deleteImage(target);
    return sendJson(res, 200, { ok: true, removed: target }), true;
  }

  // POST /api/admin/rescore { slug? } — rebuild stored results from raw with
  // each series' current points config.
  if (req.method === 'POST' && sub === 'rescore') {
    let body = {};
    try { body = await readJson(req, 10_000); } catch { /* empty body = everything */ }
    const { updated } = await rescore(db, { seriesSlug: body?.slug ?? null });
    const roster = await resyncDrivers(db);
    return sendJson(res, 200, { ok: true, rescored: updated, drivers: roster }), true;
  }

  return false;
}
