import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldStake } from '../src/lib/server/stake/index.js';

const res = (custId, finish, total) => ({ custId, displayName: `D${custId}`, finish, points: { total }, lapsLead: 0 });
const doc = (round, sims) => ({ _id: `s:${round}`, round, simsessions: sims });

test('stake is each driver\'s share of the pool after every round', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 30), res(2, 2, 10)] }]),
    doc(2, [{ kind: 'feature', results: [res(2, 1, 30), res(1, 2, 30)] }]),
  ];
  const { rounds, pool, drivers } = foldStake(docs);
  assert.deepEqual(rounds, [{ round: 1, pool: 40 }, { round: 2, pool: 100 }]);
  assert.equal(pool, 100);
  const d1 = drivers.find((d) => d.custId === 1), d2 = drivers.find((d) => d.custId === 2);
  assert.deepEqual(d1.path, [{ round: 1, points: 30, stake: 75 }, { round: 2, points: 60, stake: 60 }]);
  assert.deepEqual(d2.path, [{ round: 1, points: 10, stake: 25 }, { round: 2, points: 40, stake: 40 }]);
  assert.equal(d1.stake, 60);
  assert.equal(d1.change, -15);
  assert.equal(d2.change, 15);
  // Sorted by current stake.
  assert.deepEqual(drivers.map((d) => d.custId), [1, 2]);
});

test('a driver\'s path starts at their first round and the debut has no change', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 1, 20), res(3, 2, 20)] }]),
  ];
  const { drivers } = foldStake(docs);
  const d3 = drivers.find((d) => d.custId === 3);
  assert.deepEqual(d3.path, [{ round: 2, points: 20, stake: Math.round(1000 * 20 / 60) / 10 }]);
  assert.equal(d3.change, null);
  assert.equal(drivers.find((d) => d.custId === 1).stake, 66.7);
});

test('rounds fold in schedule order and the stake follows the standings rules', () => {
  // A drop series: after three rounds each driver drops their worst, so the
  // pool and every stake are measured on counted points only.
  const docs = [
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 2, 18), res(2, 1, 20)] }]),
  ];
  const { rounds, drivers } = foldStake(docs, { dropCount: 1 });
  assert.deepEqual(rounds.map((r) => r.round), [1, 2, 3]);
  // The drop applies once more rounds have run than the drop count, so from
  // round 2 on each driver's worst round is out of the pool.
  assert.deepEqual(rounds.map((r) => r.pool), [38, 40, 78]);
  const d1 = drivers.find((d) => d.custId === 1);
  assert.deepEqual(d1.path.map((p) => p.points), [20, 20, 40]);
  assert.equal(d1.stake, Math.round(1000 * 40 / 78) / 10);
});

test('no results means no rounds, no pool, no drivers', () => {
  assert.deepEqual(foldStake([]), { rounds: [], pool: 0, drivers: [] });
});
