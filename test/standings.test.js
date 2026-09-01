import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldStandings } from '../src/standings/index.js';

const res = (custId, finish, total, extra = {}) => ({ custId, displayName: `D${custId}`, finish, points: { total }, lapsLead: 0, ...extra });
const doc = (round, sims) => ({ _id: `s:${round}`, round, simsessions: sims });

test('folds per-round totals, season totals, and win counts', () => {
  const docs = [
    doc(1, [
      { kind: 'qualifying', results: [res(1, 1, 7), res(2, 2, 5)] },
      { kind: 'sprint', results: [res(2, 1, 1, { lapsLead: 5 }), res(1, 2, 0)] },
      { kind: 'feature', results: [res(1, 1, 20, { lapsLead: 8 }), res(2, 2, 18)] },
    ]),
    doc(2, [
      { kind: 'feature', results: [res(2, 1, 20), res(1, 2, 18)] },
    ]),
  ];
  const { rounds, standings } = foldStandings(docs);
  assert.deepEqual(rounds, [1, 2]);
  const d1 = standings.find((r) => r.custId === 1), d2 = standings.find((r) => r.custId === 2);
  assert.deepEqual(d1.rounds, { 1: 27, 2: 18 });
  assert.equal(d1.total, 45);
  assert.equal(d2.total, 44);
  assert.equal(d1.poles, 1);
  assert.equal(d2.sprintWins, 1);
  assert.equal(d1.featureWins, 1);
  assert.equal(d2.featureWins, 1);
  assert.equal(d2.lapsLed, 5);
  assert.deepEqual(standings.map((r) => r.custId), [1, 2]);
});

test('ties break on feature wins, then sprint wins, then poles', () => {
  const docs = [doc(1, [
    { kind: 'feature', results: [res(1, 1, 10), res(2, 2, 10)] },
  ])];
  assert.deepEqual(foldStandings(docs).standings.map((r) => r.custId), [1, 2]);
});
