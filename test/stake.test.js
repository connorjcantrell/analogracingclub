import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldStake } from '../src/lib/server/stake/index.js';

const res = (custId, finish, total) => ({ custId, displayName: `D${custId}`, finish, points: { total }, lapsLead: 0 });
const doc = (round, sims, extra = {}) => ({ _id: `s:${round}`, round, startTime: `2026-01-0${round}T02:00:00Z`, simsessions: sims, ...extra });

test('stake is each driver\'s share of the pool after every session', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 30), res(2, 2, 10)] }]),
    doc(2, [{ kind: 'feature', results: [res(2, 1, 30), res(1, 2, 30)] }]),
  ];
  const { steps, pool, drivers } = foldStake(docs);
  assert.deepEqual(steps.map(({ id, round, pool }) => ({ id, round, pool })), [{ id: 's:1', round: 1, pool: 40 }, { id: 's:2', round: 2, pool: 100 }]);
  assert.equal(pool, 100);
  const d1 = drivers.find((d) => d.custId === 1), d2 = drivers.find((d) => d.custId === 2);
  assert.deepEqual(d1.path, [
    { id: 's:1', points: 30, stake: 75, earned: 30, finish: 1 },
    { id: 's:2', points: 60, stake: 60, earned: 30, finish: 2 },
  ]);
  assert.deepEqual(d2.path.map((p) => p.stake), [25, 40]);
  assert.equal(d1.stake, 60);
  assert.equal(d1.change, -15);
  assert.equal(d2.change, 15);
  // Sorted by current stake.
  assert.deepEqual(drivers.map((d) => d.custId), [1, 2]);
});

test('a driver\'s path starts at their first session, the debut has no change, and a missed session still moves them', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 1, 20), res(3, 2, 20)] }]),
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20)] }]),
  ];
  const { drivers } = foldStake(docs);
  const d3 = drivers.find((d) => d.custId === 3);
  assert.deepEqual(d3.path, [
    { id: 's:2', points: 20, stake: 33.3, earned: 20, finish: 2 },
    // Sat out round 3: nothing earned, no finish, but the pool grew around them.
    { id: 's:3', points: 20, stake: 25, earned: 0, finish: null },
  ]);
  assert.equal(d3.change, -8.3);
  assert.equal(drivers.find((d) => d.custId === 1).stake, 75);
});

test('nothing is dropped: every session counts in full, in the order it ran', () => {
  // Three rounds, the third uploaded first. Were a drop rule applied each
  // driver would lose a round from the pool; stake keeps them all.
  const docs = [
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 2, 18), res(2, 1, 20)] }]),
  ];
  const { steps, drivers } = foldStake(docs);
  assert.deepEqual(steps.map((r) => r.round), [1, 2, 3]);
  assert.deepEqual(steps.map((r) => r.pool), [38, 76, 114]);
  const d1 = drivers.find((d) => d.custId === 1);
  assert.deepEqual(d1.path.map((p) => p.points), [20, 38, 58]);
  assert.equal(d1.stake, Math.round(1000 * 58 / 114) / 10);
});

test('a special event counts like any session, and only the season\'s own rounds keep their number and multiplier', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 10)] }], { seriesSlug: 'fall-2026-series' }),
    // A hosted one-off between rounds: no round, its own format's points, and
    // its race is the feature.
    { _id: '77', round: null, seriesSlug: null, title: 'Bathurst 1000', startTime: '2026-01-01T12:00:00Z',
      simsessions: [{ kind: 'qualifying', results: [res(2, 1, 7), res(1, 2, 5)] }, { kind: 'feature', results: [res(2, 1, 22), res(1, 2, 19)] }] },
    // A double-points finale.
    doc(2, [{ kind: 'feature', results: [res(1, 1, 10), res(2, 2, 10)] }], { seriesSlug: 'fall-2026-series' }),
    // A round of some other series that ran inside the season: a session, not a round.
    doc(4, [{ kind: 'sprint', results: [res(1, 1, 5)] }], { _id: 'other:4', seriesSlug: 'other-series' }),
  ];
  const own = new Set(['fall-2026-series']);
  const { steps, pool, drivers } = foldStake(docs, {
    isRound: (d) => own.has(d.seriesSlug),
    multiplier: (d) => (d.round === 2 ? 2 : 1),
  });
  assert.deepEqual(steps.map((s) => [s.id, s.round, s.title]), [['s:1', 1, null], ['77', null, 'Bathurst 1000'], ['s:2', 2, null], ['other:4', null, null]]);
  assert.deepEqual(steps.map((s) => s.pool), [30, 83, 123, 128]);
  assert.equal(pool, 128);
  const d1 = drivers.find((d) => d.custId === 1), d2 = drivers.find((d) => d.custId === 2);
  // Round 1 (20), the special (5+19), the finale doubled (20), the heat (5).
  assert.deepEqual(d1.path.map((p) => p.earned), [20, 24, 20, 5]);
  assert.deepEqual(d1.path.map((p) => p.finish), [1, 2, 1, 1]);
  assert.deepEqual(d2.path.map((p) => [p.earned, p.finish]), [[10, 2], [29, 1], [20, 2], [0, null]]);
  assert.equal(d1.points, 69);
  assert.equal(d2.points, 59);
});

test('no results means no steps, no pool, no drivers', () => {
  assert.deepEqual(foldStake([]), { steps: [], pool: 0, drivers: [] });
});
