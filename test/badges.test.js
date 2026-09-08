import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundBadges, BADGE_META } from '../src/lib/badges.js';
import { publicDescriptor } from '../src/lib/server/event-types.js';

const row = (custId, name, finish, extra = {}) =>
  ({ custId, displayName: name, finish, points: { total: 0 }, ...extra });

// A league round:
//  qualifying — Ben pole, then Andrew/Chris/Dan complete the Fast Four (top 4).
//  heat       — Andrew wins; Ben leads 10 laps.
//  feature    — Chris wins and leads 12 laps (most of the round); Evan charges
//               P5→P2 (hard charger); Andrew sets the fastest lap.
const leagueSub = () => ({
  eventType: publicDescriptor('league-fast-four'),
  simsessions: [
    { kind: 'qualifying', results: [row(2, 'Ben', 1), row(1, 'Andrew', 2), row(3, 'Chris', 3), row(4, 'Dan', 4), row(5, 'Evan', 5)] },
    { kind: 'sprint', results: [
      row(1, 'Andrew', 1, { start: 2, lapsLead: 3 }), row(2, 'Ben', 2, { start: 1, lapsLead: 10 }),
      row(3, 'Chris', 3, { start: 3 }), row(4, 'Dan', 4, { start: 4 }), row(5, 'Evan', 5, { start: 5 }),
    ] },
    { kind: 'feature', results: [
      row(3, 'Chris', 1, { start: 3, lapsLead: 12, bestLapTime: 840_000 }), row(5, 'Evan', 2, { start: 5 }),
      row(1, 'Andrew', 3, { start: 4, bestLapTime: 834_560 }), row(2, 'Ben', 4, { start: 2 }), row(4, 'Dan', 5, { start: 1 }),
    ] },
  ],
});

test('roundBadges awards each honour to the right driver', () => {
  const b = roundBadges(leagueSub(), { qualifyingPlaces: 4 });
  assert.deepEqual(b.get(2), ['pole', 'fast-four', 'led-lap']); // Ben: pole, Fast Four, led 10 laps
  assert.deepEqual(b.get(1), ['fast-four', 'heat-win', 'fastest-lap', 'led-lap']); // Andrew
  assert.deepEqual(b.get(3), ['fast-four', 'feature-win', 'most-laps']); // Chris: feature win + most laps (12)
  assert.deepEqual(b.get(4), ['fast-four']); // Dan: only a Fast Four qualifier
  assert.deepEqual(b.get(5), ['hard-charger']); // Evan: P5 heat grid → P2 feature
});

test('most-laps and led-lap are mutually exclusive per driver', () => {
  const b = roundBadges(leagueSub(), { qualifyingPlaces: 4 });
  for (const keys of b.values()) assert.ok(!(keys.includes('most-laps') && keys.includes('led-lap')));
});

test('a special one-off has no heat, Fast Four, or hard-charger', () => {
  const special = {
    eventType: publicDescriptor('hosted-qual-race'),
    simsessions: [
      { kind: 'qualifying', results: [row(2, 'Ben', 1), row(1, 'Andrew', 2)] },
      { kind: 'feature', results: [row(1, 'Andrew', 1, { start: 2, lapsLead: 5, bestLapTime: 800_000 }), row(2, 'Ben', 2, { start: 1 })] },
    ],
  };
  const b = roundBadges(special, { qualifyingPlaces: 0 });
  assert.deepEqual(b.get(2), ['pole']);
  assert.deepEqual(b.get(1), ['feature-win', 'fastest-lap', 'most-laps']);
  for (const keys of b.values()) {
    assert.ok(!keys.includes('fast-four'));
    assert.ok(!keys.includes('heat-win'));
    assert.ok(!keys.includes('hard-charger'));
  }
});

test('every badge key has display metadata', () => {
  const keys = new Set();
  for (const v of roundBadges(leagueSub(), { qualifyingPlaces: 4 }).values()) v.forEach((k) => keys.add(k));
  for (const k of keys) assert.ok(BADGE_META[k]?.label && BADGE_META[k]?.desc, `${k} has meta`);
});
