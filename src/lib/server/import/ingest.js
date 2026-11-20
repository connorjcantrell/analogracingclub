import { collections } from '../db/index.js';
import { unwrapEnvelope } from './mappers.js';
import { buildSubsessionDocument } from './build-document.js';
import { FORMATS, pointsConfigFor } from '../scoring/formats.js';
import { resolveEventType } from '../event-types.js';
import { listSeasons, stakeSeasonFor } from '../season.js';

// Upsert every (human) driver referenced by an event-result, keyed on cust_id.
export async function upsertDrivers(db, eventResult) {
  const seen = new Map(); // cust_id -> displayName
  for (const sr of eventResult.session_results ?? []) {
    for (const r of sr.results ?? []) {
      if (typeof r.cust_id !== 'number' || r.ai === true) continue;
      seen.set(r.cust_id, r.display_name ?? `Driver ${r.cust_id}`);
    }
  }
  const ops = [...seen].map(([custId, displayName]) => ({
    updateOne: { filter: { _id: custId }, update: { $set: { displayName } }, upsert: true },
  }));
  if (ops.length) await collections(db).drivers.bulkWrite(ops);
  return { count: seen.size };
}

// Ingest one uploaded event-result JSON (envelope or bare). Two shapes:
//   - League round: { seriesSlug, round } — the container stamps its eventType
//     and scores the result with its pointsConfig (the season's format applies
//     to every round).
//   - Standalone special: { eventType, title, format? } and no seriesSlug —
//     carrying its own eventType and scored under its own named points format
//     (see ../scoring/formats.js), the event type's default when none is given.
// Either way the session's points pay into the stake of the season its start
// time falls in (see ../season.js), unless `stakeExcluded` leaves it out.
// Idempotent on the resulting _id: re-uploading replaces the stored document.
export async function ingestEventResult(db, parsed, opts = {}) {
  const { seriesSlug = null, round = null, eventType = null, title = null, format = null, stakeExcluded = false } = opts;
  const { eventResult, rawType } = unwrapEnvelope(parsed);

  let build;
  if (seriesSlug) {
    const series = await collections(db).series.findOne({ slug: seriesSlug });
    if (!series) throw new Error(`series not found: ${seriesSlug}`);
    build = { seriesSlug, round, eventType: series.eventType, pointsConfig: series.pointsConfig, rawType, stakeExcluded };
  } else {
    if (!eventType) throw new Error('a standalone event needs an eventType');
    const fmt = format ?? resolveEventType(eventType).defaultFormat;
    if (!FORMATS[fmt]) throw new Error(`unknown points format: ${fmt}`);
    build = { eventType, title, format: fmt, pointsConfig: pointsConfigFor(fmt), rawType, stakeExcluded };
  }

  const drivers = await upsertDrivers(db, eventResult);
  const doc = buildSubsessionDocument(eventResult, build);
  doc.stakeSeason = stakeSeasonFor(await listSeasons(db), doc);
  // Photos, the featured shot and the post's headline/paragraph are curated in
  // the admin, not derived from the result JSON, so they survive a re-upload
  // of the same event.
  const prev = await collections(db).subsessions.findOne({ _id: doc._id }, { projection: { images: 1, featuredImage: 1, postTitle: 1, postBody: 1 } });
  for (const k of ['images', 'featuredImage', 'postTitle', 'postBody']) if (prev?.[k]) doc[k] = prev[k];
  await collections(db).subsessions.replaceOne({ _id: doc._id }, doc, { upsert: true });
  const results = doc.simsessions.reduce((n, s) => n + s.results.length, 0);
  return { subsessionId: doc._id, drivers: drivers.count, results, track: doc.track?.name ?? null, stakeSeason: doc.stakeSeason };
}
