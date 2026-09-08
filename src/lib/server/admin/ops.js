import { collections } from '../db/index.js';
import { deleteImagesFor } from '../images.js';
import { FORMATS, DEFAULT_FORMAT } from '../scoring/formats.js';
import { SERIES_STATUSES } from '../series.js';
import { DEFAULT_EVENT_TYPE, eventTypeOptions } from '../event-types.js';

// The named points presets, statuses and event types for the admin forms.
export const adminMeta = () => ({
  default: DEFAULT_FORMAT,
  formats: Object.entries(FORMATS).map(([id, f]) => ({ id, name: f.name, description: f.description, pointsConfig: f.pointsConfig })),
  statuses: SERIES_STATUSES,
  eventTypes: eventTypeOptions(),
  defaultEventType: DEFAULT_EVENT_TYPE,
});

// Every series with its full config, newest first, for the admin page.
export const listAdminSeries = (db) =>
  collections(db).series.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();

// Resync the driver roster from stored results: keep every referenced driver,
// drop the rest (after a delete or rescore).
export async function resyncDrivers(db) {
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

// Remove stored results matching `filter`, their photo folders on disk, and
// any drivers no longer referenced. Returns counts for the caller's response.
export async function removeSubsessions(db, filter) {
  const { subsessions } = collections(db);
  const ids = (await subsessions.find(filter, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  let photos = 0;
  for (const id of ids) photos += await deleteImagesFor(id);
  const del = ids.length ? await subsessions.deleteMany({ _id: { $in: ids } }) : { deletedCount: 0 };
  const drivers = await resyncDrivers(db);
  return { results: del.deletedCount, photos, drivers };
}

// A pasted event link: http(s) as given; a bare "discord.com/events/…" gets
// https; anything else (a javascript: URL, say) is dropped.
const webUrl = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : null;
};

export const cleanSchedule = (schedule) => schedule.map((r, i) => ({
  round: Number.isInteger(r?.round) ? r.round : i + 1,
  track: r?.track ? String(r.track) : null,
  date: r?.date ? String(r.date) : null,
  // The round's event page (a Discord event, say): the homepage's "Next round"
  // links there, falling back to the Discord invite when absent. And an
  // optional 2:1 image for that card, uploaded through the round-image route
  // (only a stored upload path is accepted).
  link: webUrl(r?.link),
  image: String(r?.image ?? '').startsWith('/assets/rounds/') ? String(r.image) : null,
  // A points multiplier for the round (a "double points" finale is 2). Only
  // values > 1 are stored; anything else means the round scores normally.
  multiplier: Number(r?.multiplier) > 1 ? Number(r.multiplier) : 1,
}));

// Parse a JSON request body, answering a 400 on garbage.
export async function readJson(request) {
  try { return { body: await request.json() }; }
  catch (e) { return { error: `invalid JSON: ${e.message}` }; }
}
