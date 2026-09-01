import { collections } from '../db/index.js';
import { unwrapEnvelope } from './mappers.js';
import { buildSubsessionDocument } from './build-document.js';

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

// Ingest one uploaded event-result JSON (envelope or bare) into a series round.
// Points are computed with that series' pointsConfig. Idempotent on
// (series, subsession_id): re-uploading replaces the stored document.
export async function ingestEventResult(db, parsed, { seriesSlug, round = null }) {
  const { eventResult, rawType } = unwrapEnvelope(parsed);
  const series = await collections(db).series.findOne({ slug: seriesSlug });
  if (!series) throw new Error(`series not found: ${seriesSlug}`);
  const drivers = await upsertDrivers(db, eventResult);
  const doc = buildSubsessionDocument(eventResult, { seriesSlug, round, pointsConfig: series.pointsConfig, rawType });
  await collections(db).subsessions.replaceOne({ _id: doc._id }, doc, { upsert: true });
  const results = doc.simsessions.reduce((n, s) => n + s.results.length, 0);
  return { subsessionId: doc._id, drivers: drivers.count, results };
}
