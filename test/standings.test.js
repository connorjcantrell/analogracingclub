import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldStandings } from '../src/lib/server/standings/index.js';

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

test('a round multiplier scales that round and the counted total', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 2, 18), res(2, 1, 20)] }]),
  ];
  const { standings } = foldStandings(docs, { multipliers: { 2: 2 } });
  const d1 = standings.find((r) => r.custId === 1), d2 = standings.find((r) => r.custId === 2);
  assert.deepEqual(d1.rounds, { 1: 20, 2: 36 }); // round 2 doubled
  assert.equal(d1.total, 56);
  assert.deepEqual(d2.rounds, { 1: 18, 2: 40 });
  assert.equal(d2.total, 58);
  assert.deepEqual(standings.map((r) => r.custId), [2, 1]); // double-points finale flips the order
});

test('a drop count discards each driver’s lowest rounds from the total', () => {
  // D1 scores 10, 2, 8 across three rounds; D2 scores 5, 6, 7.
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 10), res(2, 2, 5)] }]),
    doc(2, [{ kind: 'feature', results: [res(2, 1, 6), res(1, 2, 2)] }]),
    doc(3, [{ kind: 'feature', results: [res(1, 1, 8), res(2, 2, 7)] }]),
  ];
  const { standings } = foldStandings(docs, { dropCount: 1 });
  const d1 = standings.find((r) => r.custId === 1), d2 = standings.find((r) => r.custId === 2);
  assert.equal(d1.total, 18, 'D1 drops its worst round (2), keeps 10 + 8');
  assert.deepEqual(d1.dropped, [2], 'the dropped round is round 2');
  assert.equal(d2.total, 13, 'D2 drops its worst round (5), keeps 6 + 7');
  assert.deepEqual(d2.dropped, [1]);
});

test('a drop removes missed races before participated ones', () => {
  // Three rounds ran. D1 raced all three; D2 raced rounds 1 & 2 but missed 3.
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 10), res(2, 2, 5)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 2, 8), res(2, 1, 6)] }]),
    doc(3, [{ kind: 'feature', results: [res(1, 1, 9)] }]),
  ];
  const { standings } = foldStandings(docs, { dropCount: 1 });
  const d1 = standings.find((r) => r.custId === 1), d2 = standings.find((r) => r.custId === 2);
  // D2's absence (round 3 = 0) is dropped, so both real results survive.
  assert.equal(d2.total, 11, 'missed round dropped, 5 + 6 kept');
  assert.deepEqual(d2.dropped, [3]);
  // D1 raced everything, so the drop falls on its lowest real result (8).
  assert.equal(d1.total, 19);
  assert.deepEqual(d1.dropped, [2]);
});

test('a drop count never leaves a driver with nothing', () => {
  // One round, drop 1 → cannot drop your only round.
  const docs = [doc(1, [{ kind: 'feature', results: [res(1, 1, 10)] }])];
  const { standings } = foldStandings(docs, { dropCount: 1 });
  assert.equal(standings[0].total, 10);
  assert.deepEqual(standings[0].dropped, []);
});

test('folds Fast Four count and net positions gained (heat start → feature finish)', () => {
  const docs = [
    doc(1, [
      { kind: 'qualifying', results: [res(1, 1, 7), res(2, 2, 5), res(3, 3, 3)] },
      { kind: 'sprint', results: [res(1, 3, 0, { start: 3 }), res(2, 1, 1, { start: 2, lapsLead: 4 }), res(3, 2, 0, { start: 1 })] },
      { kind: 'feature', results: [res(1, 1, 20, { start: 3, lapsLead: 6 }), res(2, 2, 18, { start: 1 }), res(3, 3, 16, { start: 2 })] },
    ]),
  ];
  const { standings } = foldStandings(docs, { qualifyingPlaces: 2 });
  const d1 = standings.find((r) => r.custId === 1);
  const d2 = standings.find((r) => r.custId === 2);
  const d3 = standings.find((r) => r.custId === 3);
  // Fast Four = a qualifying result inside the top 2 (the paying places here).
  assert.deepEqual([d1.fastFours, d2.fastFours, d3.fastFours], [1, 1, 0]);
  // Positions gained = heat start minus feature finish.
  assert.deepEqual([d1.positionsGained, d2.positionsGained, d3.positionsGained], [2, 0, -2]);
  // Laps led spans heat + feature.
  assert.deepEqual([d1.lapsLed, d2.lapsLed, d3.lapsLed], [6, 4, 0]);
});

test('counts starts, and round wins / top 5s / top 10s on the round overall order', () => {
  // Round 1: D1 27, D2 24, D3 19 on points. Round 2: D1 and D2 tie on 20,
  // D2 wins it on the better feature finish; D3 sits it out.
  const docs = [
    doc(1, [
      { kind: 'qualifying', results: [res(1, 1, 7), res(2, 2, 5), res(3, 3, 3)] },
      { kind: 'feature', results: [res(1, 1, 20), res(2, 2, 19), res(3, 3, 16)] },
    ]),
    doc(2, [
      { kind: 'qualifying', results: [res(1, 1, 2), res(2, 2, 0)] },
      { kind: 'feature', results: [res(1, 2, 18), res(2, 1, 20)] },
    ]),
  ];
  const { standings } = foldStandings(docs, { qualifyingPlaces: 2 });
  const by = (id) => standings.find((r) => r.custId === id);
  assert.deepEqual([by(1).starts, by(2).starts, by(3).starts], [2, 2, 1]);
  assert.deepEqual([by(1).wins, by(2).wins, by(3).wins], [1, 1, 0]);
  assert.deepEqual([by(1).top5, by(2).top5, by(3).top5], [2, 2, 1]);
  assert.deepEqual([by(1).top10, by(2).top10, by(3).top10], [2, 2, 1]);
  // Fast Four: qualified in the top 2 — D1 both rounds, D2 both, D3 never.
  assert.deepEqual([by(1).fastFours, by(2).fastFours, by(3).fastFours], [2, 2, 0]);
});

test('top 5 and top 10 stop at the fifth and tenth place of a round', () => {
  const field = Array.from({ length: 12 }, (_, i) => res(i + 1, i + 1, 30 - i));
  const { standings } = foldStandings([doc(1, [{ kind: 'feature', results: field }])]);
  const by = (id) => standings.find((r) => r.custId === id);
  assert.deepEqual([by(5).top5, by(6).top5], [1, 0]);
  assert.deepEqual([by(10).top10, by(11).top10], [1, 0]);
  assert.equal(standings.filter((r) => r.wins).length, 1);
});

test('ties break on feature wins, then sprint wins, then poles', () => {
  const docs = [doc(1, [
    { kind: 'feature', results: [res(1, 1, 10), res(2, 2, 10)] },
  ])];
  assert.deepEqual(foldStandings(docs).standings.map((r) => r.custId), [1, 2]);
});
