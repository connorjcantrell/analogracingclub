import crypto from 'node:crypto';
import { collections } from '../db/index.js';
import { computeStandings } from '../standings/index.js';
import { newCode, normalizeCode } from './auth.js';

// Next-season car vote. One session at a time (the newest doc wins): the admin
// defines the eligible cars, a multi-day window, and the series whose final
// championship points become each driver's voting budget. A driver signs in
// with their passcode and can split their budget across cars and re-save
// freely until the window closes; ballots are keyed per driver, so a
// regenerated passcode never double-counts.
//
// Each vote is cast *for* or *against* a car: a ballot's allocation is
// { carId: signed votes } (+3 = three upvotes, -2 = two downvotes), every vote
// costs one from the budget whichever way it goes, and a car's score is its
// net (upvotes minus downvotes). The highest net wins.

export const slugifyCar = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The fixed catalog of cars eligible for a vote. The admin picks which of these
// go on a given ballot (see /admin/vote); the catalog itself is hardcoded so the
// options stay consistent rather than being retyped each season.
export const CARS = [
  'ARCA Menards',
  'EURO NASCAR V8GP',
  'Gen 4 Cup',
  'Gen 4 Grand National',
  'Late Model Stock',
  'Legends',
  'Mini Stock',
  'NASCAR Cup Series Next Gen',
  'NASCAR Legends (1987)',
  "NASCAR O'Reilly",
  'NASCAR Truck',
  'Sprint Car',
  'SRX',
  'Street Stock',
  'Late Model',
  'Super Late Model',
  'Audi 90 GTO',
  'Caterham 420R',
  'Caterham Academy',
  'Porsche 911 GT3 Cup (991)',
  'Porsche 911 GT3 Cup (992.1)',
  'Supercars Gen 3',
  'Supercars (Legacy)',
  'Lotus 49',
  'Lotus 79',
  'Nissan GTP ZX-T',
];

/** The session being voted on (or shown): the most recently created one. */
export async function getCurrentSession(db) {
  const { voteSessions } = collections(db);
  return voteSessions.find().sort({ createdAt: -1 }).limit(1).next();
}

export function sessionStatus(session, now = new Date()) {
  if (!session) return 'none';
  if (now < new Date(session.startsAt)) return 'upcoming';
  if (now >= new Date(session.endsAt)) return 'closed';
  return 'open';
}

/**
 * Season points → voting budget: a tenth, rounded up (43 → 5, 50 → 5), so
 * ballots are split across a handful of points rather than dozens. The one
 * rule every budget display and check goes through.
 */
export const scaleBudget = (total) => Math.ceil((total ?? 0) / 10);

/** A driver's season points in the source series and the votes they buy. */
export async function pointsAndBudgetFor(db, session, custId) {
  const { standings } = await computeStandings(db, { seriesSlug: session.seriesSlug });
  const points = standings.find((r) => r.custId === custId)?.total ?? 0;
  return { points, budget: scaleBudget(points) };
}

/** A driver's voting budget: their points total in the source series, scaled. */
export async function budgetFor(db, session, custId) {
  return (await pointsAndBudgetFor(db, session, custId)).budget;
}

export async function getBallot(db, sessionId, custId) {
  const { voteBallots } = collections(db);
  return voteBallots.findOne({ _id: `${sessionId}:${custId}` });
}

/**
 * Validate a raw allocation ({ carId: signed votes }) against the ballot's
 * cars. Returns the cleaned allocation (zeros dropped) and the votes it spends
 * — one per vote, up or down. Throws a message suitable for showing the voter.
 */
export function cleanAllocation(session, allocation) {
  const carIds = new Set(session.cars.map((c) => c.id));
  const clean = {};
  let spent = 0;
  for (const [carId, raw] of Object.entries(allocation)) {
    if (!carIds.has(carId)) throw new Error('Unknown car on the ballot.');
    const votes = Number(raw);
    if (!Number.isInteger(votes)) throw new Error('Votes must be whole numbers.');
    if (votes !== 0) { clean[carId] = votes; spent += Math.abs(votes); }
  }
  return { clean, spent };
}

/**
 * Validate + upsert a driver's allocation. `allocation` is { carId: signed votes }.
 * Throws a message suitable for showing the voter.
 */
export async function saveBallot(db, { session, custId, allocation }) {
  if (sessionStatus(session) !== 'open') throw new Error('Voting is closed.');
  const { clean, spent: sum } = cleanAllocation(session, allocation);
  const budget = await budgetFor(db, session, custId);
  if (sum > budget) throw new Error(`That allocation spends ${sum} of your ${budget} votes.`);
  const { voteBallots } = collections(db);
  await voteBallots.updateOne(
    { _id: `${session._id}:${custId}` },
    { $set: { sessionId: session._id, custId, allocation: clean, spent: sum, updatedAt: new Date() } },
    { upsert: true },
  );
  return { spent: sum, budget };
}

/**
 * Fold saved ballots into per-car scores: `totals` is the net (up minus
 * down) that ranks the cars, with the `up` and `down` halves alongside, and
 * `upBy` / `downBy` count the *drivers* on each side (the popular vote, as
 * opposed to the weighted one); plus turnout. Pure, so the tally rules are
 * testable without a database.
 */
export function tallyBallots(saved) {
  const totals = {}, up = {}, down = {}, upBy = {}, downBy = {};
  let voters = 0;
  for (const b of saved) {
    if (!b.spent) continue;
    voters += 1;
    for (const [carId, votes] of Object.entries(b.allocation ?? {})) {
      if (!votes) continue;
      totals[carId] = (totals[carId] ?? 0) + votes;
      if (votes > 0) { up[carId] = (up[carId] ?? 0) + votes; upBy[carId] = (upBy[carId] ?? 0) + 1; }
      else { down[carId] = (down[carId] ?? 0) - votes; downBy[carId] = (downBy[carId] ?? 0) + 1; }
    }
  }
  return { totals, up, down, upBy, downBy, voters };
}

/** Net score per car (plus the up/down split, driver counts and turnout), for the live graph and the final result. */
export async function tally(db, sessionId) {
  const { voteBallots } = collections(db);
  return tallyBallots(await voteBallots.find({ sessionId }).toArray());
}

/**
 * Who voted for what — admin only, never sent to the public page. One row per
 * saved ballot with the driver's name and their per-car split, biggest first.
 */
export async function ballots(db, session) {
  const { voteBallots, drivers } = collections(db);
  const saved = await voteBallots.find({ sessionId: session._id, spent: { $gt: 0 } }).toArray();
  if (!saved.length) return [];
  const names = new Map((await drivers.find({ _id: { $in: saved.map((b) => b.custId) } }).toArray())
    .map((d) => [d._id, d.displayName]));
  const carName = new Map(session.cars.map((c) => [c.id, c.name]));
  return saved
    .map((b) => ({
      custId: b.custId,
      driverName: names.get(b.custId) ?? `#${b.custId}`,
      spent: b.spent,
      updatedAt: new Date(b.updatedAt).toISOString(),
      // Biggest stake first, whichever way it was cast; `pts` keeps its sign.
      split: Object.entries(b.allocation ?? {})
        .filter(([, pts]) => pts !== 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || b[1] - a[1])
        .map(([carId, pts]) => ({ car: carName.get(carId) ?? carId, pts })),
    }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

/**
 * The winning car(s): the highest net score once any vote has been cast — a
 * tie returns several, and an untouched car (net 0) can beat one that was
 * only downvoted. Only meaningful once closed.
 */
export function winners(session, totals) {
  if (!session.cars.some((c) => totals[c.id])) return [];
  const max = Math.max(...session.cars.map((c) => totals[c.id] ?? 0));
  return session.cars.filter((c) => (totals[c.id] ?? 0) === max);
}

// ---- Driver passcodes (admin-managed, handed out by DM) -------------------

/** Every driver with their code (null until generated), for the admin table. */
export async function listCodes(db) {
  const { drivers, voteCodes } = collections(db);
  const [all, codes] = await Promise.all([
    drivers.find().sort({ displayName: 1 }).toArray(),
    voteCodes.find().toArray(),
  ]);
  const byDriver = new Map(codes.map((c) => [c._id, c]));
  return all.map((d) => ({
    custId: d._id, displayName: d.displayName,
    code: byDriver.get(d._id)?.code ?? null,
  }));
}

/** Give every driver without a code one. Returns how many were created. */
export async function generateMissingCodes(db) {
  const missing = (await listCodes(db)).filter((d) => !d.code);
  const { voteCodes } = collections(db);
  for (const d of missing) {
    await voteCodes.insertOne({ _id: d.custId, code: newCode(), createdAt: new Date() });
  }
  return missing.length;
}

/** Replace one driver's code (e.g. it leaked). Old code stops working at once. */
export async function regenerateCode(db, custId) {
  const { voteCodes } = collections(db);
  const code = newCode();
  await voteCodes.updateOne({ _id: custId }, { $set: { code, createdAt: new Date() } }, { upsert: true });
  return code;
}

/** The driver a typed code belongs to, or null. Format-forgiving. */
export async function driverForCode(db, raw) {
  const entered = normalizeCode(raw);
  if (entered.length < 8) return null;
  const { voteCodes, drivers } = collections(db);
  // Tiny collection — scan it rather than trusting stored formatting.
  for await (const c of voteCodes.find()) {
    if (normalizeCode(c.code) === entered) return drivers.findOne({ _id: c._id });
  }
  return null;
}

// ---- Admin session ops ----------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createSession(db, { title, seriesSlug, carNames, startsAt, endsAt }) {
  const cars = carNames.map((name) => ({ id: slugifyCar(name), name }));
  if (!cars.length) throw new Error('List at least one eligible car.');
  if (new Set(cars.map((c) => c.id)).size !== cars.length) throw new Error('Duplicate car names.');
  const start = startsAt ? new Date(startsAt) : new Date();
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 3 * DAY_MS);
  if (!(end > start)) throw new Error('The vote must end after it starts.');
  const doc = {
    _id: crypto.randomUUID(), title, seriesSlug, cars,
    startsAt: start, endsAt: end, createdAt: new Date(),
  };
  const { voteSessions } = collections(db);
  await voteSessions.insertOne(doc);
  return doc;
}

export async function deleteSession(db, sessionId) {
  const { voteSessions, voteBallots } = collections(db);
  await voteBallots.deleteMany({ sessionId });
  await voteSessions.deleteOne({ _id: sessionId });
}

/**
 * Move the vote's window. Either end may be omitted to keep it; the result
 * must still end after it starts. Instants, not wall-clock strings — the
 * caller resolves the league zone.
 */
export async function rescheduleSession(db, sessionId, { startsAt, endsAt }) {
  const { voteSessions } = collections(db);
  const session = await voteSessions.findOne({ _id: sessionId });
  if (!session) throw new Error('No such vote.');
  const start = startsAt ? new Date(startsAt) : new Date(session.startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(session.endsAt);
  if (!(end > start)) throw new Error('The vote must end after it starts.');
  await voteSessions.updateOne({ _id: sessionId }, { $set: { startsAt: start, endsAt: end } });
  return { startsAt: start, endsAt: end };
}

/** End the vote now (declares the winner early). */
export async function closeSession(db, sessionId) {
  const { voteSessions } = collections(db);
  await voteSessions.updateOne({ _id: sessionId }, { $set: { endsAt: new Date() } });
}
