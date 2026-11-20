import crypto from 'node:crypto';
import { collections } from '../db/index.js';
import { getTracks } from '../tracks/index.js';
import { sessionStatus, winners } from '../vote/index.js';
import { computeStake } from '../stake/index.js';

// Next season's track selection. The admin opens a selection naming the
// drivers who pick and the track types they may pick from (see
// /admin/track-selection); each named driver then chooses one round on
// /track-selection: a track and layout from the catalog (see ../tracks), the
// weather, the race format, and a short note. The board is public; saving a
// pick takes the same passcode sign-in as the car vote (see ../vote/auth.js).
// Picks are not tied to a season: the admin copies them into the schedule.
//
// A driver who opts out is removed from the selection (their pick goes with
// them) and their round is filled by a community vote instead: every driver
// with a passcode stakes on track-and-layout combos from the eligible
// catalog (any combo, no shortlist; a track a remaining driver holds is out).
// A driver's stake is their share of the season's points (see ../stake);
// each click on a combo adds a unit, and the stake is split evenly across
// the units — one click puts it all on one combo, a click on each of two is
// 50/50, two on one and one on another is two thirds and a third. No voting
// against. The combo with the most stake wins; one slot per removed driver.
// Weather, format and notes are not voted on: the admin sets them when the
// round goes on the schedule.

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
  const [catalog, saved, tally] = await Promise.all([
    getTracks(db),
    trackPicks.find({ selectionId: selection._id }).toArray(),
    selection.vote ? voteTally(db, selection) : null,
  ]);
  const tracks = eligibleTracks(catalog, selection.trackTypes);
  const byDriver = new Map(saved.map((p) => [p.custId, p]));
  const pickers = selection.drivers.map((d) => ({ ...d, pick: resolve(catalog, byDriver.get(d.custId)) }));
  const vote = selection.vote ? voteView(selection, tracks, tally) : null;
  // The community's rounds: one slot per removed driver, filled by the vote's
  // winners once it closes (a tie beyond the slots leaves the extras to the admin).
  const slots = (selection.removed ?? []).length;
  const community = Array.from({ length: slots }, (_, i) => ({ slot: i + 1, pick: vote?.winners?.[i] ?? null }));
  const typeCounts = selection.trackTypes
    .map((type) => ({ type, count: [...pickers, ...community].filter((p) => p.pick?.type === type).length }));
  return {
    selection: { id: selection._id, title: selection.title, trackTypes: selection.trackTypes, createdAt: selection.createdAt.toISOString() },
    pickers,
    removed: (selection.removed ?? []).map((d) => ({ custId: d.custId, displayName: d.displayName, removedAt: d.removedAt?.toISOString?.() ?? null })),
    community,
    vote,
    tracks: tracks.map((t) => ({
      id: t._id, name: t.name,
      configs: t.configs.map(({ srhConfigId, name, shortName, type, lengthMi, turns }) => ({ id: srhConfigId, name, shortName, type, lengthMi, turns })),
    })),
    typeCounts,
    picked: pickers.filter((p) => p.pick).length + community.filter((c) => c.pick).length,
  };
}

// ---- Opting out, and the community vote that fills the round -------------

/**
 * Take a driver out of the selection: they leave the roster, their pick is
 * deleted, and their round becomes a community slot. Throws if they are not
 * on it.
 */
export async function removeDriver(db, selection, custId) {
  const driver = selection.drivers.find((d) => d.custId === custId);
  if (!driver) throw new Error('That driver is not on this selection.');
  const { trackSelections, trackPicks } = collections(db);
  await trackPicks.deleteOne({ _id: `${selection._id}:${custId}` });
  await trackSelections.updateOne({ _id: selection._id }, {
    $pull: { drivers: { custId } },
    $push: { removed: { custId, displayName: driver.displayName, removedAt: new Date() } },
  });
}

/** Put a removed driver back on the roster (an accidental removal, or a change of heart). */
export async function restoreDriver(db, selection, custId) {
  const driver = (selection.removed ?? []).find((d) => d.custId === custId);
  if (!driver) throw new Error('That driver was not removed.');
  if (selection.vote && (selection.removed ?? []).length === 1) throw new Error('Delete the community vote first: restoring the last removed driver leaves it nothing to fill.');
  const { trackSelections } = collections(db);
  await trackSelections.updateOne({ _id: selection._id }, {
    $pull: { removed: { custId } },
    $push: { drivers: { custId, displayName: driver.displayName } },
  });
}

/**
 * Open the community vote on a selection with at least one removed driver.
 * Mirrors a car-vote session's window and the series whose points set each
 * driver's stake; the ballot is the whole eligible catalog, so there is no
 * shortlist. Throws an admin-facing message.
 */
export async function openVote(db, selection, { seriesSlug, startsAt, endsAt }) {
  if (!(selection.removed ?? []).length) throw new Error('Remove a driver first: the vote fills their round.');
  if (selection.vote) throw new Error('A community vote is already open. Delete it to start over.');
  if (!seriesSlug) throw new Error('Pick the series whose stake is spent.');
  const start = startsAt ? new Date(startsAt) : new Date();
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (!(end > start)) throw new Error('The vote must end after it starts.');
  const vote = { seriesSlug: String(seriesSlug), startsAt: start, endsAt: end, createdAt: new Date() };
  await collections(db).trackSelections.updateOne({ _id: selection._id }, { $set: { vote } });
  return vote;
}

/** Move the vote's window. Either end may be omitted to keep it. */
export async function rescheduleVote(db, selection, { startsAt, endsAt }) {
  if (!selection.vote) throw new Error('No community vote to reschedule.');
  const start = startsAt ? new Date(startsAt) : new Date(selection.vote.startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(selection.vote.endsAt);
  if (!(end > start)) throw new Error('The vote must end after it starts.');
  const { trackSelections } = collections(db);
  await trackSelections.updateOne({ _id: selection._id }, { $set: { 'vote.startsAt': start, 'vote.endsAt': end } });
}

/** End the vote now (declares the winner early). */
export async function closeVote(db, selection) {
  const { trackSelections } = collections(db);
  await trackSelections.updateOne({ _id: selection._id }, { $set: { 'vote.endsAt': new Date() } });
}

/** Drop the vote and every ballot; the slots stay until the drivers are restored. */
export async function deleteVote(db, selection) {
  const { trackSelections, trackVoteBallots } = collections(db);
  await trackVoteBallots.deleteMany({ selectionId: selection._id });
  await trackSelections.updateOne({ _id: selection._id }, { $unset: { vote: '' } });
}

export async function getVoteBallot(db, selectionId, custId) {
  return collections(db).trackVoteBallots.findOne({ _id: `${selectionId}:${custId}` });
}

// A combo on the ballot is `<trackId>:<configId>`; track slugs carry no colon.
export const comboId = (trackId, configId) => `${trackId}:${configId}`;
export function parseCombo(id) {
  const i = String(id).lastIndexOf(':');
  return i < 0 ? null : { trackId: id.slice(0, i), configId: Number(id.slice(i + 1)) };
}

/** The eligible combo for an id, or null: a known layout on a track no driver holds. */
export function findCombo(tracks, held, id) {
  const c = parseCombo(id);
  if (!c || held.has(c.trackId)) return null;
  const track = tracks.find((t) => t._id === c.trackId);
  const config = track?.configs.find((x) => x.srhConfigId === c.configId);
  return config ? { ...c, track, config } : null;
}

/**
 * Validate a raw ballot ({ comboId: clicks }) against the eligible tracks:
 * every id must be a layout the selection allows on a track no remaining
 * driver holds (`held` is those track ids), counts whole and non-negative,
 * zeros dropped. Returns the counts and the total clicks they split the
 * stake into. Pure; throws a voter-facing message.
 */
export function cleanStakes(tracks, held, raw) {
  const counts = {};
  let clicks = 0;
  for (const [id, v] of Object.entries(raw ?? {})) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error('Stakes must be whole, non-negative counts.');
    if (!n) continue;
    const combo = findCombo(tracks, held, id);
    if (!combo) throw new Error(parseCombo(id) && held.has(parseCombo(id).trackId) ? 'A driver already holds that track.' : 'That layout is not on offer.');
    counts[id] = n;
    clicks += n;
  }
  return { counts, clicks };
}

/** A driver's stake split across their clicks: { candidateId: stake points }. Pure. */
export function stakeShares({ counts, stake }) {
  const clicks = Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
  if (!clicks || !stake) return {};
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, (stake * n) / clicks]));
}

/**
 * A ballot with the clicks on tracks drivers have since taken dropped — a
 * driver's pick wins over community stake, and the rest of the stake
 * re-splits across what is left. Pure.
 */
export function liveBallot(b, held = new Set()) {
  const counts = Object.fromEntries(Object.entries(b.counts ?? {}).filter(([id]) => !held.has(parseCombo(id)?.trackId)));
  return { ...b, counts, clicks: Object.values(counts).reduce((a, n) => a + n, 0) };
}

/**
 * Fold saved ballots into per-combo stake: `totals` is the stake on each
 * combo (percentage points of the season's pool, to two decimals), `backers`
 * how many drivers put anything on it, `voters` how many ballots carry a
 * click, and `staked` the stake those voters hold between them. `held` are
 * the tracks drivers hold, whose combos are dropped. Pure.
 */
export function tallyStakes(saved, held = new Set()) {
  const totals = {}, backers = {};
  let voters = 0, staked = 0;
  for (const raw of saved) {
    const b = liveBallot(raw, held);
    if (!b.clicks) continue;
    voters += 1;
    staked += b.stake ?? 0;
    for (const [id, share] of Object.entries(stakeShares(b))) {
      totals[id] = (totals[id] ?? 0) + share;
      backers[id] = (backers[id] ?? 0) + 1;
    }
  }
  const round2 = (x) => Math.round(x * 100) / 100;
  for (const id of Object.keys(totals)) totals[id] = round2(totals[id]);
  return { totals, backers, voters, staked: round2(staked) };
}

/** A driver's points and stake (share of the pool, in percent) in the vote's series. */
export async function stakeFor(db, vote, custId) {
  const { drivers } = await computeStake(db, { seriesSlug: vote.seriesSlug });
  const d = drivers.find((r) => r.custId === custId);
  return { points: d?.points ?? 0, stake: d?.stake ?? 0 };
}

/** The ids of the tracks the remaining drivers hold on a selection. */
async function heldTracks(db, selection) {
  const picks = await collections(db).trackPicks.find({ selectionId: selection._id }, { projection: { trackId: 1 } }).toArray();
  return new Set(picks.map((p) => p.trackId));
}

/**
 * Validate + upsert a driver's ballot ({ comboId: clicks }). Anyone with a
 * passcode votes, picker or not; their stake is snapshotted on the ballot at
 * save time. Throws a message suitable for showing the voter.
 */
export async function saveStake(db, { selection, custId, raw }) {
  const vote = selection.vote;
  if (!vote) throw new Error('There is no community vote.');
  if (sessionStatus(vote) !== 'open') throw new Error('Voting is closed.');
  const [catalog, held] = await Promise.all([getTracks(db), heldTracks(db, selection)]);
  const { counts, clicks } = cleanStakes(eligibleTracks(catalog, selection.trackTypes), held, raw);
  const { stake } = await stakeFor(db, vote, custId);
  await collections(db).trackVoteBallots.updateOne(
    { _id: `${selection._id}:${custId}` },
    { $set: { selectionId: selection._id, custId, counts, clicks, stake, updatedAt: new Date() } },
    { upsert: true },
  );
  return { clicks, stake };
}

/** Stake per combo (plus backers and turnout), for the live graph and the result. */
export async function voteTally(db, selection) {
  const [saved, held] = await Promise.all([
    collections(db).trackVoteBallots.find({ selectionId: selection._id }).toArray(),
    heldTracks(db, selection),
  ]);
  return tallyStakes(saved, held);
}

/**
 * Who staked what — admin only. One row per saved ballot with the driver's
 * name, their stake, and the split across combos (share of their stake),
 * biggest first. `catalog` names the combos.
 */
export async function voteBallots(db, selection, catalog) {
  const { trackVoteBallots, drivers } = collections(db);
  const [saved, held] = await Promise.all([
    trackVoteBallots.find({ selectionId: selection._id, clicks: { $gt: 0 } }).toArray(),
    heldTracks(db, selection),
  ]);
  if (!saved.length) return [];
  const names = new Map((await drivers.find({ _id: { $in: saved.map((b) => b.custId) } }).toArray())
    .map((d) => [d._id, d.displayName]));
  return saved
    .map((raw) => liveBallot(raw, held))
    .filter((b) => b.clicks)
    .map((b) => ({
      custId: b.custId,
      driverName: names.get(b.custId) ?? `#${b.custId}`,
      stake: b.stake ?? 0,
      updatedAt: new Date(b.updatedAt).toISOString(),
      split: Object.entries(b.counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => ({ name: comboName(resolve(catalog, parseCombo(id))), share: Math.round((100 * n) / b.clicks) })),
    }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

// "Track – Short name"; a short name that is just the track name stands alone.
export const comboName = (r) => (r.shortName && r.shortName !== r.track ? `${r.track} – ${r.shortName}` : r.track);

/**
 * The public shape of the community vote: the window and status, the stake
 * tally with every staked combo resolved to names, and the winners (one per
 * slot, plus ties) once closed. `tracks` are the eligible tracks. Pure given
 * the tally.
 */
export function voteView(selection, tracks, tally, now = new Date()) {
  const vote = selection.vote;
  const status = sessionStatus(vote, now);
  const slots = (selection.removed ?? []).length;
  const { totals, backers, voters, staked } = tally ?? tallyStakes([]);
  const candidates = Object.keys(totals).map((id) => {
    const r = resolve(tracks, parseCombo(id));
    return { ...r, id, name: comboName(r) };
  });
  return {
    seriesSlug: vote.seriesSlug, slots, status,
    startsAt: new Date(vote.startsAt).toISOString(), endsAt: new Date(vote.endsAt).toISOString(),
    candidates, totals, backers, voters, staked,
    winners: status === 'closed' ? winners(candidates, totals, slots) : null,
  };
}

function resolve(tracks, p) {
  if (!p) return null;
  const track = tracks.find((t) => t._id === p.trackId);
  const config = track?.configs.find((c) => c.srhConfigId === p.configId);
  return {
    trackId: p.trackId, configId: p.configId, weather: p.weather ?? null, variation: p.variation ?? null, notes: p.notes ?? '',
    track: track?.name ?? p.trackId, config: config?.name ?? null, shortName: config?.shortName ?? null,
    type: config?.type ?? null, lengthMi: config?.lengthMi ?? null, turns: config?.turns ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
  };
}
