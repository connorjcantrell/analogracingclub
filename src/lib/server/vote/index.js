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
 * A driver's voting budget: their final points total in the source series,
 * scaled down by a tenth and rounded up (43 → 5, 50 → 5), so ballots are split
 * across a handful of points rather than dozens.
 */
export async function budgetFor(db, session, custId) {
  const { standings } = await computeStandings(db, { seriesSlug: session.seriesSlug });
  const total = standings.find((r) => r.custId === custId)?.total ?? 0;
  return Math.ceil(total / 10);
}

export async function getBallot(db, sessionId, custId) {
  const { voteBallots } = collections(db);
  return voteBallots.findOne({ _id: `${sessionId}:${custId}` });
}

/**
 * Validate + upsert a driver's allocation. `allocation` is { carId: points }.
 * Throws a message suitable for showing the voter.
 */
export async function saveBallot(db, { session, custId, allocation }) {
  if (sessionStatus(session) !== 'open') throw new Error('Voting is closed.');
  const carIds = new Set(session.cars.map((c) => c.id));
  const clean = {};
  let sum = 0;
  for (const [carId, raw] of Object.entries(allocation)) {
    if (!carIds.has(carId)) throw new Error('Unknown car on the ballot.');
    const pts = Number(raw);
    if (!Number.isInteger(pts) || pts < 0) throw new Error('Points must be whole numbers.');
    if (pts > 0) { clean[carId] = pts; sum += pts; }
  }
  const budget = await budgetFor(db, session, custId);
  if (sum > budget) throw new Error(`That allocation spends ${sum} of your ${budget} points.`);
  const { voteBallots } = collections(db);
  await voteBallots.updateOne(
    { _id: `${session._id}:${custId}` },
    { $set: { sessionId: session._id, custId, allocation: clean, spent: sum, updatedAt: new Date() } },
    { upsert: true },
  );
  return { spent: sum, budget };
}

/** Points per car plus turnout, for the live graph and the final result. */
export async function tally(db, sessionId) {
  const { voteBallots } = collections(db);
  const totals = {};
  let voters = 0;
  for await (const b of voteBallots.find({ sessionId })) {
    if (!b.spent) continue;
    voters += 1;
    for (const [carId, pts] of Object.entries(b.allocation ?? {})) totals[carId] = (totals[carId] ?? 0) + pts;
  }
  return { totals, voters };
}

/** The winning car(s) — a tie returns several. Only meaningful once closed. */
export function winners(session, totals) {
  const max = Math.max(0, ...session.cars.map((c) => totals[c.id] ?? 0));
  if (max === 0) return [];
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

/** End the vote now (declares the winner early). */
export async function closeSession(db, sessionId) {
  const { voteSessions } = collections(db);
  await voteSessions.updateOne({ _id: sessionId }, { $set: { endsAt: new Date() } });
}
