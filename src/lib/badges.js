// Per-round driver honours, shown as pills beside a name in the results tables.
// Pure so it can be unit-tested and run on either side. Each badge is a
// round-level award computed from the whole subsession, so it reads the same
// wherever the driver appears (overall table or a single-session tab).
import { raceSessions } from './format.js';

export const BADGE_META = {
  'pole': { label: 'Pole', desc: 'Fastest qualifier of the round.' },
  'fast-four': { label: 'Fast Four', desc: 'Qualified inside the paying places (the Fast Four), then started inverted at the back.' },
  'heat-win': { label: 'Heat Win', desc: 'Won the heat race.' },
  'feature-win': { label: 'Feature Win', desc: 'Won the feature race.' },
  'fastest-lap': { label: 'Fastest Lap', desc: 'Set the fastest lap of the feature.' },
  'most-laps': { label: 'Most Laps', desc: 'Led the most laps across the round.' },
  'led-lap': { label: 'Led a Lap', desc: 'Led at least one lap of the round.' },
  'hard-charger': { label: 'Hard Charger', desc: 'Gained the most positions from the heat grid to the feature finish.' },
};

// Order badges read in, so a driver's pills are always in the same order.
const ORDER = ['pole', 'fast-four', 'heat-win', 'feature-win', 'fastest-lap', 'most-laps', 'led-lap', 'hard-charger'];

export function roundBadges(sub, { qualifyingPlaces = 0 } = {}) {
  const sims = sub?.simsessions ?? [];
  const rowsOf = (kind) => sims.find((s) => s.kind === kind)?.results ?? [];
  const races = raceSessions(sub?.eventType);
  const featureKind = races[races.length - 1]?.kind;

  const earned = new Map(); // custId -> Set(keys)
  const give = (custId, key) => {
    if (custId == null) return;
    (earned.get(custId) ?? earned.set(custId, new Set()).get(custId)).add(key);
  };

  // Pole + Fast Four, from qualifying.
  const qual = rowsOf('qualifying');
  const pole = qual.find((r) => r.finish === 1);
  if (pole) give(pole.custId, 'pole');
  if (qualifyingPlaces > 0) {
    for (const r of qual) if (r.finish >= 1 && r.finish <= qualifyingPlaces) give(r.custId, 'fast-four');
  }

  // Race wins: the heat (when the event runs one) and the feature.
  const heatWin = rowsOf('sprint').find((r) => r.finish === 1);
  if (heatWin) give(heatWin.custId, 'heat-win');
  const featureWin = rowsOf(featureKind).find((r) => r.finish === 1);
  if (featureWin) give(featureWin.custId, 'feature-win');

  // Fastest lap of the feature.
  let fl = null;
  for (const r of rowsOf(featureKind)) {
    if (r.bestLapTime == null || r.bestLapTime <= 0) continue;
    if (!fl || r.bestLapTime < fl.t) fl = { custId: r.custId, t: r.bestLapTime };
  }
  if (fl) give(fl.custId, 'fastest-lap');

  // Laps led across every race session: the leader gets "Most Laps", everyone
  // else who led at least one lap gets "Led a Lap" (the bonus-point award).
  const led = new Map();
  for (const s of races) for (const r of rowsOf(s.kind)) {
    if ((r.lapsLead ?? 0) > 0) led.set(r.custId, (led.get(r.custId) ?? 0) + r.lapsLead);
  }
  let most = null;
  for (const [custId, laps] of led) if (!most || laps > most.laps) most = { custId, laps };
  if (most) give(most.custId, 'most-laps');
  for (const [custId] of led) if (custId !== most?.custId) give(custId, 'led-lap');

  // Hard charger: most positions gained from the heat grid to the feature flag.
  // Needs a distinct heat (sprint) and feature — a one-off race has neither.
  const heat = rowsOf('sprint');
  if (heat.length && featureKind && featureKind !== 'sprint') {
    const heatStart = new Map(heat.map((r) => [r.custId, r.start]));
    let hc = null;
    for (const r of rowsOf(featureKind)) {
      const start = heatStart.get(r.custId);
      if (start == null || r.finish == null) continue;
      const gained = start - r.finish;
      if (gained > 0 && (!hc || gained > hc.gained)) hc = { custId: r.custId, gained };
    }
    if (hc) give(hc.custId, 'hard-charger');
  }

  // Freeze to ordered arrays.
  const out = new Map();
  for (const [custId, set] of earned) out.set(custId, ORDER.filter((k) => set.has(k)));
  return out;
}
