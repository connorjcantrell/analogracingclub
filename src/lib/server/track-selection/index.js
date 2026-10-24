import crypto from 'node:crypto';
import { collections } from '../db/index.js';
import { getTracks } from '../tracks/index.js';

// Next season's track selection. The admin opens a selection naming the
// drivers who pick and the track types they may pick from (see
// /admin/track-selection); each named driver then chooses one round on
// /track-selection: a track and layout from the catalog (see ../tracks), the
// weather, the race format, and a short note. The board is public; saving a
// pick takes the same passcode sign-in as the car vote (see ../vote/auth.js).
// Picks are not tied to a season: the admin copies them into the schedule.

export const WEATHER = [
  { id: 'dry', label: 'Dry' },
  { id: 'wet', label: 'Wet' },
  { id: 'dry-to-wet', label: 'Dry to wet' },
  { id: 'wet-to-dry', label: 'Wet to dry' },
];

// The two round formats, described as on /format.
export const VARIATIONS = [
  { id: 'standard', label: 'Standard', blurb: 'A 10-minute heat from the inverted grid sets the feature grid, then a 20-minute feature.' },
  { id: 'long', label: 'Long', blurb: 'No heat. One 40-minute feature from the inverted grid, with limited fuel, so every driver has to make a pit stop.' },
];

export const NOTES_MAX = 150;

// The catalog's track types in the order the admin sees them.
export const TRACK_TYPES = ['Road Course', 'Short Track', 'Speedway', 'Superspeedway', 'Dirt Oval', 'Rallycross'];

/** The selection being picked for (or shown): the most recently created one. */
export async function getCurrentSelection(db) {
  const { trackSelections } = collections(db);
  return trackSelections.find().sort({ createdAt: -1 }).limit(1).next();
}

/**
 * Validate the admin's form: a title, at least one track type the catalog
 * knows, and at least one driver. `drivers` are the known drivers; the
 * selection keeps them in the order given. Pure; throws an admin-facing message.
 */
export function cleanSelection({ title, trackTypes, custIds }, { drivers }) {
  const name = String(title ?? '').trim();
  if (!name) throw new Error('Give the selection a title.');
  const types = [...new Set((trackTypes ?? []).map(String))];
  const unknown = types.find((t) => !TRACK_TYPES.includes(t));
  if (unknown) throw new Error(`Unknown track type: ${unknown}.`);
  if (!types.length) throw new Error('Allow at least one track type.');
  const known = new Map(drivers.map((d) => [Number(d._id), d]));
  const ids = [...new Set((custIds ?? []).map(Number))];
  const stranger = ids.find((id) => !known.has(id));
  if (stranger !== undefined) throw new Error(`Unknown driver #${stranger}.`);
  if (!ids.length) throw new Error('Pick at least one driver.');
  return {
    title: name,
    trackTypes: TRACK_TYPES.filter((t) => types.includes(t)),
    drivers: ids.map((id) => ({ custId: id, displayName: known.get(id).displayName })),
  };
}

export async function createSelection(db, raw) {
  const { drivers, trackSelections } = collections(db);
  const clean = cleanSelection(raw, { drivers: await drivers.find({}, { projection: { displayName: 1 } }).toArray() });
  const doc = { _id: crypto.randomUUID(), ...clean, createdAt: new Date() };
  await trackSelections.insertOne(doc);
  return doc;
}

export async function deleteSelection(db, selectionId) {
  const { trackSelections, trackPicks } = collections(db);
  await trackPicks.deleteMany({ selectionId });
  await trackSelections.deleteOne({ _id: selectionId });
}

/** The catalog narrowed to the allowed types; tracks with nothing left are dropped. */
export function eligibleTracks(tracks, trackTypes) {
  const allowed = new Set(trackTypes);
  return tracks
    .map((t) => ({ ...t, configs: t.configs.filter((c) => allowed.has(c.type)) }))
    .filter((t) => t.configs.length);
}

/**
 * Validate a raw pick from the form against the eligible tracks. Returns the
 * stored shape; throws a message suitable for showing the driver. Pure.
 */
export function cleanPick(tracks, raw) {
  const track = tracks.find((t) => t._id === String(raw.trackId ?? ''));
  if (!track) throw new Error('Pick a track.');
  const config = track.configs.find((c) => String(c.srhConfigId) === String(raw.configId ?? ''));
  if (!config) throw new Error(`Pick a layout of ${track.name}.`);
  const weather = WEATHER.find((w) => w.id === raw.weather)?.id;
  if (!weather) throw new Error('Pick the weather.');
  const variation = VARIATIONS.find((v) => v.id === raw.variation)?.id;
  if (!variation) throw new Error('Pick Standard or Long.');
  const notes = String(raw.notes ?? '').replace(/\s+/g, ' ').trim();
  if ([...notes].length > NOTES_MAX) throw new Error(`Keep the note to ${NOTES_MAX} characters.`);
  return { trackId: track._id, configId: config.srhConfigId, weather, variation, notes };
}

/**
 * One track per selection, whatever the layout: the pick is refused when
 * another driver already holds that track. Pure; `saved` are the selection's
 * stored picks. Throws the driver-facing message naming who has it.
 */
export function assertTrackFree(saved, { custId, trackId }, drivers = []) {
  const holder = saved.find((p) => p.trackId === trackId && p.custId !== custId);
  if (!holder) return;
  const name = drivers.find((d) => d.custId === holder.custId)?.displayName ?? 'another driver';
  throw new Error(`${name} already has that track. Pick a different one.`);
}

/** Validate + upsert a driver's pick. Throws a message suitable for the driver. */
export async function savePick(db, { selection, custId, raw }) {
  if (!selection.drivers.some((d) => d.custId === custId)) throw new Error('You are not one of the drivers picking in this selection.');
  const pick = cleanPick(eligibleTracks(await getTracks(db), selection.trackTypes), raw);
  const { trackPicks } = collections(db);
  assertTrackFree(await trackPicks.find({ selectionId: selection._id }).toArray(), { custId, trackId: pick.trackId }, selection.drivers);
  try {
    await trackPicks.updateOne(
      { _id: `${selection._id}:${custId}` },
      { $set: { selectionId: selection._id, custId, ...pick, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (e) {
    // Two drivers saving the same track at once: the unique index on
    // (selectionId, trackId) catches what the read above raced past.
    if (e?.code === 11000) throw new Error('Someone just took that track. Pick a different one.');
    throw e;
  }
  return pick;
}

/**
 * The board for a selection: every picker in the admin's order with their
 * pick resolved to names, the catalog the form chooses from, and how many
 * picks landed on each type.
 */
export async function selectionView(db, selection) {
  const { trackPicks } = collections(db);
  const [catalog, saved] = await Promise.all([getTracks(db), trackPicks.find({ selectionId: selection._id }).toArray()]);
  const tracks = eligibleTracks(catalog, selection.trackTypes);
  const byDriver = new Map(saved.map((p) => [p.custId, p]));
  const pickers = selection.drivers.map((d) => ({ ...d, pick: resolve(catalog, byDriver.get(d.custId)) }));
  const typeCounts = selection.trackTypes
    .map((type) => ({ type, count: pickers.filter((p) => p.pick?.type === type).length }));
  return {
    selection: { id: selection._id, title: selection.title, trackTypes: selection.trackTypes, createdAt: selection.createdAt.toISOString() },
    pickers,
    tracks: tracks.map((t) => ({
      id: t._id, name: t.name,
      configs: t.configs.map(({ srhConfigId, name, shortName, type, lengthMi, turns }) => ({ id: srhConfigId, name, shortName, type, lengthMi, turns })),
    })),
    typeCounts,
    picked: pickers.filter((p) => p.pick).length,
  };
}

function resolve(tracks, p) {
  if (!p) return null;
  const track = tracks.find((t) => t._id === p.trackId);
  const config = track?.configs.find((c) => c.srhConfigId === p.configId);
  return {
    trackId: p.trackId, configId: p.configId, weather: p.weather, variation: p.variation, notes: p.notes ?? '',
    track: track?.name ?? p.trackId, config: config?.name ?? null, shortName: config?.shortName ?? null,
    type: config?.type ?? null, lengthMi: config?.lengthMi ?? null, turns: config?.turns ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
  };
}
