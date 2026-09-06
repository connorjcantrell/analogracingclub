import test from 'node:test';
import assert from 'node:assert/strict';
import { computePower, computeHeadToHead, rivalries, attachPositionChanges, overallOrder, rankScores, recencyWeight, scaleRating, MAX_RACES, MIN_EVENTS, RATING_FLOOR, WEIGHTS } from '../src/power/index.js';

const driver = (custId, finish, extra = {}) => ({
  custId, displayName: `D${custId}`, finish,
  bestLapTime: 850_000, lapsLead: 0, points: { total: 0 }, ...extra,
});
// One event: qualifying + feature run in the given finishing order.
const event = (startTime, order, extra = () => ({})) => ({
  startTime,
  simsessions: ['qualifying', 'feature'].map((kind) => ({
    kind,
    results: order.map((id, i) => driver(id, i + 1, extra(kind, i))),
  })),
});
const find = (rows, id) => rows.find((r) => r.custId === id);

test('recency sheds 10% per race back to a ten-race cutoff', () => {
  assert.equal(recencyWeight(0), 1, 'the newest race counts in full');
  assert.ok(Math.abs(recencyWeight(1) - 0.9) < 1e-9, 'one race back loses 10%');
  assert.ok(Math.abs(recencyWeight(4) - 0.6) < 1e-9);
  assert.ok(recencyWeight(6) < recencyWeight(4), 'older races weigh less');
  assert.ok(Math.abs(recencyWeight(MAX_RACES - 1) - 0.1) < 1e-9, 'the tenth race is worth 10%');
  assert.equal(recencyWeight(MAX_RACES), 0, 'the eleventh is dropped entirely');
  assert.equal(recencyWeight(999), 0);
});

test('recent form outranks identical older form', () => {
  // D1 and D4 have the same record; only WHEN they won differs.
  const rows = computePower([
    event('2024-01-01', [1, 2, 3, 4]),
    event('2024-02-01', [1, 2, 3, 4]),
    event('2025-06-01', [4, 3, 2, 1]),
    event('2025-07-01', [4, 3, 2, 1]),
  ], { minEvents: 1 });
  const recent = find(rows, 4);
  const faded = find(rows, 1);
  assert.equal(recent.wins, faded.wins, 'same number of wins');
  assert.equal(recent.avgFinish, faded.avgFinish, 'same average finish');
  assert.ok(recent.rating > faded.rating, 'the recent winner rates higher');
  assert.equal(rows[0].custId, 4);
});

test('finishing position is scored against the size of the field', () => {
  const field = (n) => ({
    startTime: '2025-01-01',
    simsessions: [{ kind: 'feature', results: Array.from({ length: n }, (_, i) => driver(i + 1, i + 1)) }],
  });
  const inBigField = find(computePower([field(20)], { minEvents: 1 }), 5);
  const inSmallField = find(computePower([field(6)], { minEvents: 1 }), 5);
  assert.ok(inBigField.rating > inSmallField.rating, 'P5 of 20 beats P5 of 6');
});

test('drivers under the event minimum are provisional and listed last', () => {
  // Explicit minEvents so this test does not move when the default changes.
  const rows = computePower([
    // The newcomer wins their only outing; the regular has three events.
    { startTime: '2025-03-01', simsessions: [{ kind: 'feature', results: [driver(1, 1), driver(2, 2)] }] },
    { startTime: '2025-02-01', simsessions: [{ kind: 'feature', results: [driver(2, 1)] }] },
    { startTime: '2025-01-01', simsessions: [{ kind: 'feature', results: [driver(2, 1)] }] },
  ], { minEvents: 2 });
  const rookie = find(rows, 1);
  const regular = find(rows, 2);
  assert.equal(rookie.provisional, true);
  assert.equal(regular.provisional, false);
  assert.ok(rows.indexOf(regular) < rows.indexOf(rookie), 'provisional drivers sort last');
});




test('a driver missing a component is not penalised for the gap', () => {
  const rows = computePower([{
    startTime: '2025-01-01',
    simsessions: [{ kind: 'feature', results: [driver(1, 1, { lapsLead: 5 })] }],
  }], { minEvents: 1 });
  assert.ok(find(rows, 1).rating > 0, 'still rated on the parts they do have');
});


test('overall is decided by points in a scored series round', () => {
  const pts = (custId, finish, total) => ({ ...driver(custId, finish), points: { total } });
  const doc = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', results: [pts(3, 1, 7), pts(1, 2, 5), pts(2, 3, 3)] },
      { kind: 'sprint', results: [pts(2, 1, 1), pts(3, 2, 0), pts(1, 3, 0)] },
      { kind: 'feature', results: [pts(1, 1, 20), pts(2, 2, 18), pts(3, 3, 16)] },
    ],
  };
  // Totals: D1 25, D3 23, D2 22 — so D3 places above D2 despite finishing
  // behind them in the feature.
  assert.deepEqual(overallOrder(doc), [1, 3, 2]);
});

test('overall falls back to the feature when nothing is scored', () => {
  // A special event awards no points, so the feature finish is the result.
  const doc = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', results: [driver(3, 1), driver(1, 2), driver(2, 3)] },
      { kind: 'sprint', results: [driver(2, 1), driver(3, 2), driver(1, 3)] },
      { kind: 'feature', results: [driver(1, 1), driver(2, 2), driver(3, 3)] },
    ],
  };
  assert.deepEqual(overallOrder(doc), [1, 2, 3], 'feature order wins, not qualifying or sprint');
});

test('overall uses the sprint when an unscored event has no feature', () => {
  const doc = { startTime: '2025-01-01', simsessions: [{ kind: 'sprint', results: [driver(9, 1), driver(8, 2)] }] };
  assert.deepEqual(overallOrder(doc), [9, 8]);
  assert.equal(overallOrder({ simsessions: [{ kind: 'practice', results: [driver(1, 1)] }] }), null);
});

test('the overall component and its stats reach the ranking', () => {
  const doc = {
    startTime: '2025-01-01',
    simsessions: [{ kind: 'feature', results: [driver(1, 1), driver(2, 2), driver(3, 3)] }],
  };
  const rows = computePower([doc], { minEvents: 1 });
  assert.equal(find(rows, 1).components.overall, 100, 'winning the event scores full overall');
  assert.equal(find(rows, 3).components.overall, 0, 'last scores zero');
  assert.equal(find(rows, 1).avgOverall, 1);
  assert.equal(find(rows, 1).overallWins, 1);
  assert.equal(find(rows, 2).overallWins, 0);
});

test('a driver stays provisional until three events', () => {
  const ev = (startTime, ids) => ({
    startTime,
    simsessions: [{ kind: 'feature', results: ids.map((id, i) => driver(id, i + 1)) }],
  });
  assert.equal(MIN_EVENTS, 3);
  // D1 runs three events, D2 only two.
  const rows = computePower([ev('2025-03-01', [1, 2]), ev('2025-02-01', [1, 2]), ev('2025-01-01', [1])]);
  assert.equal(find(rows, 1).provisional, false, 'three events clears provisional');
  assert.equal(find(rows, 2).provisional, true, 'two does not');
});

test('rankScores spreads 0-100 evenly and shares ties', () => {
  const e = (key, value) => ({ key, value });
  assert.deepEqual([...rankScores([e('a', 10), e('b', 5), e('c', 1)])],
    [['a', 100], ['b', 50], ['c', 0]]);
  assert.deepEqual([...rankScores([e('a', 1), e('b', 2), e('c', 3)], { higherIsBetter: false })],
    [['a', 100], ['b', 50], ['c', 0]]);
  // Tied drivers share the average of the places they span.
  assert.deepEqual([...rankScores([e('a', 9), e('b', 5), e('c', 5), e('d', 1)])],
    [['a', 100], ['b', 50], ['c', 50], ['d', 0]]);
  assert.deepEqual([...rankScores([e('a', 7)])], [['a', 50]], 'a field of one is neutral');
  assert.deepEqual([...rankScores([e('a', 3), e('b', null)])], [['a', 50]], 'null values are unranked');
});

test('best lap averages the lap-time placing across every official session', () => {
  const lap = (custId, finish, bestLapTime) => ({ ...driver(custId, finish), bestLapTime });
  const rows = computePower([{
    startTime: '2025-01-01',
    simsessions: [
      // D1 is quickest in qualifying, D2 in both races — so D2 averages better.
      { kind: 'qualifying', results: [lap(1, 1, 840_000), lap(2, 2, 850_000)] },
      { kind: 'sprint', results: [lap(2, 1, 845_000), lap(1, 2, 855_000)] },
      { kind: 'feature', results: [lap(2, 1, 844_000), lap(1, 2, 854_000)] },
    ],
  }], { minEvents: 1 });
  assert.equal(find(rows, 2).avgBestLap, 1.3, 'fastest in two of three sessions');
  assert.equal(find(rows, 1).avgBestLap, 1.7);
  assert.equal(find(rows, 2).components.bestLap, 100, 'the better average is ranked top');
  assert.equal(find(rows, 1).components.bestLap, 0);
});

test('cars passed is the start minus the finish, averaged over official sessions', () => {
  const mv = (custId, finish, start) => ({ ...driver(custId, finish), start });
  const rows = computePower([{
    startTime: '2025-01-01',
    simsessions: [
      // D2 climbs 8th -> 3rd (+5); D1 drops 1st -> 4th (-3).
      { kind: 'feature', results: [mv(3, 1, 2), mv(2, 3, 8), mv(1, 4, 1)] },
    ],
  }], { minEvents: 1 });
  assert.equal(find(rows, 2).avgGained, 5, 'five cars passed');
  assert.equal(find(rows, 1).avgGained, -3, 'three places lost');
  assert.equal(find(rows, 2).components.gained, 100);
  assert.equal(find(rows, 1).components.gained, 0);
  assert.equal(find(rows, 2).gainedTotal, 5);
});

test('marginToLeader records the gap that ranking discards', () => {
  const ev = (startTime, ids) => ({
    startTime,
    simsessions: [{ kind: 'feature', results: ids.map((id, i) => driver(id, i + 1)) }],
  });
  const rows = computePower([ev('2025-01-01', [1, 2, 3])], { minEvents: 1 });
  assert.equal(find(rows, 1).marginToLeader, 0, 'the leader is level with themselves');
  assert.equal(find(rows, 2).marginToLeader, 1);
  assert.equal(find(rows, 3).marginToLeader, 2);
});

test('every metric is weighted; laps-led is removed for now', () => {
  assert.deepEqual(Object.keys(WEIGHTS), ['overall', 'gained', 'bestLap', 'avgLap', 'finishing']);
  assert.equal(WEIGHTS.lapsLed, undefined, 'laps led is commented out for now');
  assert.equal(WEIGHTS.pace, undefined, 'pace was replaced by the best-lap placing');
});

test('recency is counted per driver, not over the league calendar', () => {
  const ev = (startTime, ids) => ({
    startTime,
    simsessions: [{ kind: 'feature', results: ids.map((id, i) => driver(id, i + 1)) }],
  });
  // Twelve league events. D1 enters every one; D2 only the three oldest.
  // D2's own last three races are therefore still at full weight.
  const docs = [];
  for (let i = 0; i < 12; i += 1) {
    const day = String(12 - i).padStart(2, '0');
    docs.push(ev(`2025-02-${day}`, i >= 9 ? [1, 2] : [1]));
  }
  const rows = computePower(docs, { minEvents: 1 });
  assert.equal(find(rows, 2).events, 3);
  assert.equal(find(rows, 2).avgOverall, 2, 'their three races count in full despite the gap');
});

test('races past the ten-race cutoff are excluded from the averages', () => {
  const ev = (startTime, ids) => ({
    startTime,
    simsessions: [{ kind: 'feature', results: ids.map((id, i) => driver(id, i + 1)) }],
  });
  // D1 wins their ten most recent races and loses the two before that.
  const docs = [];
  for (let i = 0; i < 12; i += 1) {
    const day = String(12 - i).padStart(2, '0');
    docs.push(ev(`2025-02-${day}`, i >= 10 ? [2, 1] : [1, 2]));
  }
  const d1 = find(computePower(docs, { minEvents: 1 }), 1);
  assert.equal(d1.avgOverall, 1, 'the two stale defeats do not drag the average');
  assert.equal(d1.events, 12, 'but they still count as participation');
});

test('avgIncidents averages per race subsession, recency-weighted, races only', () => {
  const inc = (id, incidents) => ({ ...driver(id, 1), incidents });
  // One event: qualifying incidents are ignored; the heat (2) and feature (4)
  // count as two subsession samples → average 3.
  const ev = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', results: [inc(1, 9)] },
      { kind: 'sprint', results: [inc(1, 2)] },
      { kind: 'feature', results: [inc(1, 4)] },
    ],
  };
  const d1 = find(computePower([ev], { minEvents: 1 }), 1);
  assert.equal(d1.avgIncidents, 3, 'mean of the two race subsessions, qualifying excluded');
  assert.equal(d1.incidentsTotal, 6, 'total counts races only');
});

test('position change reflects movement since the prior ranking', () => {
  const drivers = [{ custId: 1, provisional: false }, { custId: 2, provisional: false }, { custId: 3, provisional: false }];
  const prior = [{ custId: 2, provisional: false }, { custId: 1, provisional: false }, { custId: 3, provisional: false }];
  attachPositionChanges(drivers, prior);
  assert.equal(drivers[0].change, 1, 'D1 rose from 2nd to 1st');
  assert.equal(drivers[1].change, -1, 'D2 slipped from 1st to 2nd');
  assert.equal(drivers[2].change, 0, 'D3 held station');
});

test('a newly ranked driver has no position change', () => {
  const drivers = [{ custId: 1, provisional: false }, { custId: 2, provisional: false }];
  attachPositionChanges(drivers, [{ custId: 1, provisional: false }]);
  assert.equal(drivers[1].change, null, 'D2 was not ranked before');
});

test('races finished is the lightest metric', () => {
  assert.equal(WEIGHTS.finishing, 5);
  assert.ok(Object.entries(WEIGHTS).every(([k, w]) => k === 'finishing' || w > WEIGHTS.finishing),
    'finishing is lighter than every other metric');
});

test('average lap ranks sustained pace, separately from the single best lap', () => {
  const lap = (custId, finish, bestLapTime, averageLapTime) =>
    ({ ...driver(custId, finish), bestLapTime, averageLapTime });
  // D1 sets the quickest laps but is scruffy over a run; D2 is the reverse.
  const doc = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', results: [lap(1, 1, 840_000, 880_000), lap(2, 2, 850_000, 852_000)] },
      { kind: 'sprint', results: [lap(1, 1, 841_000, 881_000), lap(2, 2, 851_000, 853_000)] },
      { kind: 'feature', results: [lap(1, 1, 842_000, 882_000), lap(2, 2, 852_000, 854_000)] },
    ],
  };
  const rows = computePower([doc], { minEvents: 1 });
  assert.equal(find(rows, 1).components.bestLap, 100, 'D1 owns the outright pace');
  assert.equal(find(rows, 1).components.avgLap, 0, 'but not the sustained pace');
  assert.equal(find(rows, 2).components.avgLap, 100, 'D2 is quicker over a run');
  assert.equal(find(rows, 2).avgLapRank, 1);
  assert.equal(find(rows, 1).avgLapRank, 2);
});

test('avgLap ignores qualifying — it is heats-and-features pace only', () => {
  const lap = (custId, finish, avg) => ({ ...driver(custId, finish), averageLapTime: avg });
  const doc = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', results: [lap(1, 1, 800_000), lap(2, 2, 900_000)] }, // D1 quicker average here
      { kind: 'feature', results: [lap(1, 2, 900_000), lap(2, 1, 800_000)] },    // D2 quicker over the run
    ],
  };
  const rows = computePower([doc], { minEvents: 1 });
  // Only the feature counts: were qualifying included, both would average 1.5.
  assert.equal(find(rows, 1).avgLapRank, 2, 'the quick qualifying average does not lift D1');
  assert.equal(find(rows, 2).avgLapRank, 1);
});

test('a driver with no timed average is not penalised for the gap', () => {
  const rows = computePower([{
    startTime: '2025-01-01',
    simsessions: [{ kind: 'feature', results: [driver(1, 1), driver(2, 2)] }],
  }], { minEvents: 1 });
  // The fixture records no averageLapTime at all, so the metric is unranked.
  assert.equal(find(rows, 1).components.avgLap, null);
  assert.ok(find(rows, 1).rating > 0, 'still rated on the metrics they do have');
});

test('the published rating is remapped onto the floor, components stay 0-100', () => {
  // The mapping itself: raw 0-100 in, RATING_FLOOR-100 out.
  assert.equal(scaleRating(0), RATING_FLOOR, 'a raw zero publishes as the floor');
  assert.equal(scaleRating(100), 100);
  assert.equal(scaleRating(50), RATING_FLOOR + (100 - RATING_FLOOR) / 2, 'linear in between');

  const ev = (startTime, ids) => ({
    startTime,
    simsessions: [{ kind: 'feature', results: ids.map((id, i) => driver(id, i + 1)) }],
  });
  const rows = computePower([ev('2025-01-01', [1, 2, 3])], { minEvents: 1 });

  // Components keep the raw scale, so the last-placed driver is a clean 0 on
  // the metrics that can separate a field — only the rating is rescaled.
  assert.equal(find(rows, 3).components.overall, 0);
  assert.equal(find(rows, 1).components.overall, 100);
  assert.ok(rows.every((r) => r.rating >= RATING_FLOOR), 'nothing publishes below the floor');
  assert.ok(rows.every((r) => r.rating <= 100));

  // Each rating is exactly its weighted component average, put through the map.
  for (const r of rows) {
    const used = Object.entries(WEIGHTS).filter(([k]) => r.components[k] != null);
    const raw = used.reduce((a, [k, w]) => a + r.components[k] * w, 0)
      / used.reduce((a, [, w]) => a + w, 0);
    assert.equal(r.rating, Math.round(scaleRating(raw) * 10) / 10,
      `${r.displayName}: rating is the scaled weighted average`);
  }
});

test('head-to-head builds a transitive, field-centred order for one event', () => {
  const rows = computeHeadToHead([event('2025-01-01', [1, 2, 3, 4])], { minEvents: 1 });
  const o = (id) => find(rows, id).components.overall;
  assert.ok(o(1) > o(2) && o(2) > o(3) && o(3) > o(4), 'finishing order is preserved');
  // Colley ratings are centred on 50 (average 0.5), so the field is symmetric.
  assert.ok(Math.abs((o(1) + o(4)) - 100) < 0.3);
  assert.ok(Math.abs((o(2) + o(3)) - 100) < 0.3);
  assert.equal(rows[0].custId, 1);
});

test('head-to-head ranks drivers who never met through common opponents', () => {
  const feat = (t, results) => ({ startTime: t, simsessions: [{ kind: 'feature', results }] });
  const r = (id, finish) => ({ custId: id, displayName: `D${id}`, finish, bestLapTime: 0, averageLapTime: 0, lapsLead: 0, points: { total: 0 } });
  // D1 beats D2; later D2 beats D3. D1 and D3 never share a race.
  const rows = computeHeadToHead([
    feat('2025-01-01', [r(1, 1), r(2, 2)]),
    feat('2025-02-01', [r(2, 1), r(3, 2)]),
  ], { minEvents: 1 });
  const o = (id) => find(rows, id).components.overall;
  assert.ok(o(1) > o(2) && o(2) > o(3), 'D1 > D2 > D3 by transitivity');
  assert.equal(rows[0].custId, 1, 'D1 tops despite never racing D3');
});

test('a driver alone on a metric gets no head-to-head comparison, not a punished score', () => {
  // Only D1 sets an average lap time, so nobody can be compared on avgLap.
  const ev = {
    startTime: '2025-01-01',
    simsessions: [{
      kind: 'feature',
      results: [
        { custId: 1, displayName: 'D1', finish: 1, bestLapTime: 850_000, averageLapTime: 900_000, lapsLead: 0, points: { total: 0 } },
        { custId: 2, displayName: 'D2', finish: 2, bestLapTime: 860_000, averageLapTime: 0, lapsLead: 0, points: { total: 0 } },
      ],
    }],
  };
  const rows = computeHeadToHead([ev], { minEvents: 1 });
  assert.equal(find(rows, 1).components.avgLap, null, 'no opponent with a time → no score');
  assert.ok(find(rows, 1).components.overall > 50, 'still ranked on the metrics that do compare');
});

test('rivalries expose every opponent and record decisive metrics', () => {
  const rows = rivalries([
    event('2025-01-01', [1, 2]),
    event('2025-02-01', [2, 1]),
    event('2025-03-01', [1, 2]),
    event('2025-04-01', [1, 3]),
  ]);
  const d1 = rows.get(1);
  const vs2 = d1.opponents.find((o) => o.custId === 2);
  assert.equal(vs2.meetings, 3);
  // Overall: D1 finished ahead of D2 in two of the three races.
  const overall = vs2.record.find((m) => m.metric === 'overall');
  assert.equal(overall.you, 2);
  assert.equal(overall.them, 1);
});

test('the rival is the most evenly split opponent, not the most-raced', () => {
  // D1 dominates D2 (5-0 over five races) but splits with D3 (2-2 over four).
  const rows = rivalries([
    event('2025-01-01', [1, 2]), event('2025-01-02', [1, 2]), event('2025-01-03', [1, 2]),
    event('2025-01-04', [1, 2]), event('2025-01-05', [1, 2]),
    event('2025-01-06', [1, 3]), event('2025-01-07', [3, 1]),
    event('2025-01-08', [1, 3]), event('2025-01-09', [3, 1]),
  ]);
  const d1 = rows.get(1);
  assert.equal(d1.rival, 3, 'a 2-2 split beats a 5-0 record with more races');
  assert.equal(d1.opponents[0].custId, 3, 'the fiercest rivalry sorts first');
});

test('a rival needs at least three shared races', () => {
  // D1 (five races) splits 1-1 with D3 over just two races — too few — so the
  // rival is D2, whom they met three times.
  const rows = rivalries([
    event('2025-01-01', [1, 2]), event('2025-01-02', [2, 1]), event('2025-01-03', [1, 2]),
    event('2025-01-04', [1, 3]), event('2025-01-05', [3, 1]),
  ]);
  assert.equal(rows.get(1).rival, 2, 'D3 with two races is below the minimum');
});

test('a driver with fewer than three races can still have a rival', () => {
  // D1 raced only twice, both against D2 → the bar drops to two shared races.
  const rows = rivalries([
    event('2025-01-01', [1, 2]), event('2025-01-02', [2, 1]),
  ]);
  assert.equal(rows.get(1).rival, 2, 'the 3-race bar relaxes to the driver’s race count');
});

test('a metric is one head-to-head per event, decided by subsession wins', () => {
  const r = (id, best) => ({ custId: id, displayName: `D${id}`, finish: 1, bestLapTime: best, averageLapTime: 0, lapsLead: 0, points: { total: 0 } });
  // One event, three subsessions. Speed: D1 wins qualifying + feature, D2 the
  // heat → D1 takes the event 2-1 (a single comparison, not three).
  const ev = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', number: -4, results: [r(1, 800), r(2, 810)] },
      { kind: 'sprint', number: -3, results: [r(1, 810), r(2, 800)] },
      { kind: 'feature', number: 0, results: [r(1, 800), r(2, 810)] },
    ],
  };
  const vs2 = rivalries([ev]).get(1).opponents.find((o) => o.custId === 2);
  const speed = vs2.record.find((m) => m.metric === 'bestLap');
  assert.equal(speed.you, 1, 'D1 takes the event on speed');
  assert.equal(speed.them, 0);
  assert.equal(vs2.meetings, 1, 'a single shared event');
});

test('a speed tie is broken by qualifying', () => {
  const r = (id, best) => ({ custId: id, displayName: `D${id}`, finish: 1, bestLapTime: best, averageLapTime: 0, lapsLead: 0, points: { total: 0 } });
  // Split 1-1: D1 quickest in qualifying, D2 in the feature → qualifying decides.
  const ev = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'qualifying', number: -4, results: [r(1, 800), r(2, 810)] },
      { kind: 'feature', number: 0, results: [r(1, 810), r(2, 800)] },
    ],
  };
  const vs2 = rivalries([ev]).get(1).opponents.find((o) => o.custId === 2);
  const speed = vs2.record.find((m) => m.metric === 'bestLap');
  assert.equal(speed.you, 1, 'qualifying breaks the speed split for D1');
  assert.equal(speed.them, 0);
});

test('a pace tie is broken by the feature', () => {
  const r = (id, avg) => ({ custId: id, displayName: `D${id}`, finish: 1, bestLapTime: 800, averageLapTime: avg, lapsLead: 0, points: { total: 0 } });
  // Split over heat + feature; the feature (last race) decides — for D2 here.
  const ev = {
    startTime: '2025-01-01',
    simsessions: [
      { kind: 'sprint', number: -3, results: [r(1, 800), r(2, 810)] },
      { kind: 'feature', number: 0, results: [r(1, 810), r(2, 800)] },
    ],
  };
  const vs2 = rivalries([ev]).get(1).opponents.find((o) => o.custId === 2);
  const pace = vs2.record.find((m) => m.metric === 'avgLap');
  assert.equal(pace.them, 1, 'the feature breaks the pace split for D2');
  assert.equal(pace.you, 0);
});

test('head-to-head reuses the descriptive stats from the rank method', () => {
  const docs = [event('2025-01-01', [1, 2, 3]), event('2025-02-01', [2, 1, 3])];
  const h = computeHeadToHead(docs, { minEvents: 1 });
  const r = computePower(docs, { minEvents: 1 });
  for (const id of [1, 2, 3]) {
    assert.equal(find(h, id).wins, find(r, id).wins, `D${id}: same win count`);
    assert.equal(find(h, id).events, find(r, id).events, `D${id}: same event count`);
  }
});
