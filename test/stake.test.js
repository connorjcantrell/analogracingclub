import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldStake, multipliers } from '../src/lib/server/stake/index.js';
import { MIN_RACES, MIN_ROUNDS, WINDOW_RACES, MULT_MIN, MULT_MAX, cleanLevel, multText, countedCorners } from '../src/lib/stake-rules.js';

// A result row; without laps the race does not count toward the multiplier,
// so the tests above the multiplier section see every multiplier fixed at 1.
const res = (custId, finish, total, { incidents, laps } = {}) => ({ custId, displayName: `D${custId}`, finish, points: { total }, lapsLead: 0, incidents, lapsComplete: laps });
// Every doc runs on a one-corner road layout unless told otherwise, so a
// race's corners equal its laps and the rates below read as per-lap figures.
const ROAD = { name: 'Test Road', config: null, category: 'Road', corners: 1 };
const doc = (round, sims, extra = {}) => ({ _id: `s:${round}`, round, startTime: `2026-01-0${round}T02:00:00Z`, simsessions: sims, track: ROAD, ...extra });
// Stake needs MIN_RACES races on record (see stake-rules). The tests below
// are about what happens once a driver holds stake, so unless they say
// otherwise every driver 1–5 arrives with MIN_RACES earlier races: single
// sessions (no round of any series) on a layout with no corner count, so
// they open the gate without touching the rate or the hot hand.
const PRIOR = Array.from({ length: MIN_RACES }, (_, i) => ({
  _id: `prior:${i}`, round: null, seriesSlug: null, startTime: `2025-06-0${i + 1}T02:00:00Z`, track: { ...ROAD, corners: null },
  simsessions: [{ kind: 'feature', results: [1, 2, 3, 4, 5].map((id, k) => res(id, k + 1, 0, { incidents: 0, laps: 10 })) }],
}));
const fold = (docs, opts = {}) => foldStake(docs, { ...opts, history: [...PRIOR, ...(opts.history ?? [])] });

test('stake is each driver\'s share of the pool after every session', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 30), res(2, 2, 10)] }]),
    doc(2, [{ kind: 'feature', results: [res(2, 1, 30), res(1, 2, 30)] }]),
  ];
  const { steps, pool, drivers } = fold(docs);
  assert.deepEqual(steps.map(({ id, round, pool }) => ({ id, round, pool })), [{ id: 's:1', round: 1, pool: 40 }, { id: 's:2', round: 2, pool: 100 }]);
  assert.equal(pool, 100);
  const d1 = drivers.find((d) => d.custId === 1), d2 = drivers.find((d) => d.custId === 2);
  assert.deepEqual(d1.path, [
    { id: 's:1', points: 30, stake: 75, earned: 30, finish: 1, ipc: null, pos: 1 },
    { id: 's:2', points: 60, stake: 60, earned: 30, finish: 2, ipc: null, pos: 1 },
  ]);
  assert.deepEqual(d2.path.map((p) => p.stake), [25, 40]);
  assert.equal(d1.stake, 60);
  assert.equal(d1.change, -15);
  assert.equal(d2.change, 15);
  // Sorted by current stake; neither has moved, so no places gained or lost.
  assert.deepEqual(drivers.map((d) => d.custId), [1, 2]);
  assert.deepEqual(drivers.map((d) => d.posChange), [0, 0]);
});

test('a driver\'s path starts at their first session, the debut has no change, and a missed session still moves them', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 1, 20), res(3, 2, 20)] }]),
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20)] }]),
  ];
  const { drivers } = fold(docs);
  const d3 = drivers.find((d) => d.custId === 3);
  assert.deepEqual(d3.path, [
    { id: 's:2', points: 20, stake: 33.3, earned: 20, finish: 2, ipc: null, pos: 2 },
    // Sat out round 3: nothing earned, no finish, but the pool grew around them.
    { id: 's:3', points: 20, stake: 25, earned: 0, finish: null, ipc: null, pos: 2 },
  ]);
  assert.equal(d3.change, -8.3);
  assert.equal(drivers.find((d) => d.custId === 1).stake, 75);
});

test('each path entry carries the driver\'s place after the session, and posChange the places gained since the one before', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 10)] }]),
    // Driver 1 sits out; driver 2 wins and passes them.
    doc(2, [{ kind: 'feature', results: [res(2, 1, 30)] }]),
  ];
  const { drivers } = fold(docs);
  const d1 = by(drivers, 1), d2 = by(drivers, 2);
  assert.deepEqual(drivers.map((d) => d.custId), [2, 1]);
  assert.deepEqual(d1.path.map((p) => p.pos), [1, 2]);
  assert.deepEqual(d2.path.map((p) => p.pos), [2, 1]);
  assert.equal(d1.posChange, -1);
  assert.equal(d2.posChange, 1);
  // A debut has no move.
  assert.deepEqual(fold(docs.slice(0, 1)).drivers.map((d) => d.posChange), [null, null]);
});

test('stake needs MIN_RACES races on record, in any season: until then it is 0 and the driver is left out of the share', () => {
  // Driver 1 has raced MIN_RACES times before; driver 2 is new. Both score
  // 20 a race. Driver 2 reaches MIN_RACES at round MIN_RACES and holds
  // stake from that session on, with every point they have scored so far.
  const docs = Array.from({ length: MIN_RACES + 1 }, (_, i) => doc(i + 1, [{ kind: 'feature', results: [res(1, 1, 20, { incidents: 0, laps: 10 }), res(2, 2, 20, { incidents: 0, laps: 10 })] }]));
  const history = PRIOR.map((d) => ({ ...d, simsessions: [{ kind: 'feature', results: [res(1, 1, 0, { incidents: 0, laps: 10 })] }] }));
  const { drivers, pool } = foldStake(docs, { history });
  const d1 = by(drivers, 1), d2 = by(drivers, 2);
  assert.deepEqual([d1.entered, d1.eligible, d2.entered, d2.eligible], [MIN_RACES + MIN_RACES + 1, true, MIN_RACES + 1, true]);
  // The pool counts every point paid, the newcomer's included.
  assert.equal(pool, 2 * 20 * (MIN_RACES + 1));
  // Before the gate driver 1 holds it all; from the qualifying race the two are level.
  assert.deepEqual(d2.path.map((p) => p.stake), [...Array(MIN_RACES - 1).fill(0), 50, 50]);
  assert.deepEqual(d1.path.map((p) => p.stake), [...Array(MIN_RACES - 1).fill(100), 50, 50]);
  assert.deepEqual(d2.path.map((p) => p.pos), [...Array(MIN_RACES - 1).fill(2), 2, 2]);
  // A race the driver completed no laps of does not open the gate; a lap of
  // one with no corner count does (see PRIOR), without feeding the rate.
  const none = foldStake([doc(1, [{ kind: 'feature', results: [res(2, 1, 20, { incidents: 0, laps: 0 })] }])], { history: PRIOR.slice(0, MIN_RACES - 1) });
  assert.deepEqual([by(none.drivers, 2).entered, by(none.drivers, 2).eligible, by(none.drivers, 2).stake], [MIN_RACES - 1, false, 0]);
  assert.equal(by(foldStake(docs.slice(0, 1), { history: PRIOR }).drivers, 2).history, 1);
  // Nobody eligible: nobody holds stake, and nothing divides by zero.
  const fresh = foldStake(docs.slice(0, 1));
  assert.deepEqual(fresh.drivers.map((d) => [d.eligible, d.stake]), [[false, 0], [false, 0]]);
  // A provisional driver is told what they would hold: their points joining
  // the share. Driver 2's 20 against driver 1's 20 after one race is half;
  // once eligible there is nothing to tell.
  const first = foldStake(docs.slice(0, 1), { history });
  assert.deepEqual([by(first.drivers, 2).wouldBe, by(first.drivers, 1).wouldBe], [50, null]);
  // Two newcomers alone: each would hold it all, there being no share to join.
  assert.deepEqual(fresh.drivers.map((d) => d.wouldBe), [100, 100]);
});

test('nothing is dropped: every session counts in full, in the order it ran', () => {
  // Three rounds, the third uploaded first. Were a drop rule applied each
  // driver would lose a round from the pool; stake keeps them all.
  const docs = [
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20), res(2, 2, 18)] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 2, 18), res(2, 1, 20)] }]),
  ];
  const { steps, drivers } = fold(docs);
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
  const { steps, pool, drivers } = fold(docs, {
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
  assert.deepEqual(fold([]), { steps: [], pool: 0, drivers: [] });
});

// ---- The clean-driving multiplier ----
// One race per doc; each driver's [custId, points, incidents, laps] in it.
const race = (n, rows) => doc(n, [{ kind: 'feature', results: rows.map(([id, pts, incidents, laps], i) => res(id, i + 1, pts, { incidents, laps })) }]);
// The same race run MIN_RACES times (rounds 1..MIN_RACES), so everyone is calculated.
const season = (rows, n = MIN_RACES) => Array.from({ length: n }, (_, i) => race(i + 1, rows));
const by = (drivers, id) => drivers.find((d) => d.custId === id);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const near = (x) => Math.round(x * 1e9) / 1e9;

test('the constants are what was agreed', () => {
  assert.deepEqual([MIN_RACES, WINDOW_RACES, MULT_MIN, MULT_MAX], [3, 5, 0.5, 1.5]);
});

test('stake is points times the multiplier, as a share of the field: the brief\'s worked case', () => {
  // MIN_RACES races each, so everyone is calculated. Per 100 laps: A 10
  // incidents (0.10/lap), B 20 (0.20, the median), C 30 (0.30); points 40/35/25.
  const docs = season([[1, 40 / MIN_RACES, 10, 100], [2, 35 / MIN_RACES, 20, 100], [3, 25 / MIN_RACES, 30, 100]]);
  const { drivers } = fold(docs);
  const [a, b, c] = [1, 2, 3].map((id) => by(drivers, id));
  assert.deepEqual([a.points, b.points, c.points].map(near), [40, 35, 25]);
  assert.deepEqual([a.ipc, b.ipc, c.ipc].map(near), [0.1, 0.2, 0.3]);
  assert.deepEqual([a.multiplier, b.multiplier, c.multiplier].map(near), [1.5, 1, 0.5]);
  assert.deepEqual([a.stake, b.stake, c.stake], [55.8, 32.6, 11.6]);
  assert.deepEqual(drivers.map((d) => d.fixed), [false, false, false]);
  assert.equal(Math.round(sum(drivers.map((d) => d.stake)) * 10) / 10, 100);
  assert.equal(drivers[0].custId, 1);
});

test('only the roughest driver is at MULT_MIN and only the cleanest at MULT_MAX; the rest scale with their distance from the median', () => {
  const rows = (id, incidents) => ({ custId: id, races: Array.from({ length: MIN_RACES }, () => ({ incidents, corners: 100 })) });
  // Per 100 laps: 10, 15, 20, 30 and 50 incidents, a median of 0.2.
  const { median, byDriver } = multipliers([rows(1, 10), rows(2, 15), rows(3, 20), rows(4, 30), rows(5, 50)]);
  const m = (id) => near(byDriver.get(id).multiplier);
  assert.equal(near(median), 0.2);
  // The cleanest takes the ceiling; driver 2 is halfway from the median to them.
  assert.equal(m(1), MULT_MAX);
  assert.equal(m(2), 1.25);
  assert.equal(m(3), 1);
  // Driver 4 is a third of the way from the median to the roughest; only driver 5 is at the floor.
  assert.equal(m(4), near(1 - 0.5 / 3));
  assert.equal(m(5), MULT_MIN);
  // However far out the roughest driver is, nobody else reaches the floor.
  const far = multipliers([rows(1, 20), rows(2, 20), rows(3, 20), rows(4, 60), rows(5, 500)]);
  assert.equal(near(far.byDriver.get(4).multiplier), near(1 - 0.5 * (0.4 / 4.8)));
  assert.equal(far.byDriver.get(5).multiplier, MULT_MIN);
  assert.deepEqual([1, 2, 3].map((id) => far.byDriver.get(id).multiplier), [1, 1, 1]);
  // Nobody rougher than the median: the median driver stays at 1 and the clean side still scales.
  const half = multipliers([rows(1, 10), rows(2, 20)]);
  assert.equal(near(half.median), 0.15);
  assert.deepEqual([half.byDriver.get(1).multiplier, half.byDriver.get(2).multiplier], [MULT_MAX, MULT_MIN]);
});

test('the move in incidents per corner is the rate now against the rate after the session before', () => {
  // A: 1 in 10, then 3 in 10 (rolling 0.1 → 0.2), then sits out. B: 2 in 10 every time.
  const docs = [race(1, [[1, 20, 1, 10], [2, 18, 2, 10]]), race(2, [[1, 20, 3, 10], [2, 18, 2, 10]])];
  let { drivers } = fold(docs);
  assert.deepEqual(by(drivers, 1).path.map((p) => p.ipc), [0.1, 0.2]);
  assert.equal(near(by(drivers, 1).ipcChange), 0.1);
  assert.equal(by(drivers, 2).ipcChange, 0);
  // Nothing to compare after the first session.
  assert.equal(by(fold(docs.slice(0, 1)).drivers, 1).ipcChange, null);
  // A sits out the third race: their rate holds, so no move; B gets cleaner.
  ({ drivers } = fold([...docs, race(3, [[2, 18, 0, 10]])]));
  assert.equal(by(drivers, 1).ipcChange, 0);
  assert.equal(near(by(drivers, 2).ipcChange), near(4 / 30 - 0.2));
  // A debutant has a rate but no earlier one.
  ({ drivers } = fold([...docs, race(3, [[2, 18, 0, 10], [3, 15, 5, 10]])]));
  assert.equal(by(drivers, 3).ipcChange, null);
});

test('the window is rolling: with one race more than the window, the oldest one\'s incidents and laps are ignored', () => {
  // A: a disastrous first race (50 incidents in 10 laps), then clean ones at
  // 1 in 10. B: steady at 0.2/lap. Only A's last WINDOW_RACES count.
  const n = WINDOW_RACES + 1;
  const docs = Array.from({ length: n }, (_, i) => race(i + 1, [[1, 20, i === 0 ? 50 : 1, 10], [2, 18, 2, 10]]));
  const { drivers } = fold(docs);
  const a = by(drivers, 1);
  assert.equal(a.history, n);
  assert.equal(near(a.ipc), 0.1);
  // Median of (0.1, 0.2) is 0.15: A is the cleanest of the two.
  assert.equal(near(a.multiplier), MULT_MAX);
  // One race fewer and the disaster is still inside the window.
  assert.ok(by(fold(docs.slice(0, n - 1)).drivers, 1).ipc > 1);
});

test('the rate is incidents per corner: laps times the layout\'s corners per lap, an oval\'s counting half', () => {
  const track = (category, corners) => ({ track: { name: 'T', config: null, category, corners } });
  // Driver 1: 12 incidents over 10 laps of a 12-corner road course (120
  // corners, 0.1/corner), MIN_RACES times. Driver 2: the same incidents and
  // laps on a 4-corner oval, which counts as 2 a lap (20 corners, 0.6/corner).
  const docs = Array.from({ length: MIN_RACES }, (_, i) => doc(i + 1, [{ kind: 'feature', results: [res(1, 1, 10, { incidents: 12, laps: 10 }), res(2, 2, 10, { incidents: 12, laps: 10 })] }]));
  const road = fold(docs.map((d) => ({ ...d, ...track('Road', 12) })));
  assert.equal(near(by(road.drivers, 1).ipc), 0.1);
  const mixed = fold(docs.map((d, i) => ({ ...d, ...track(i === 0 ? 'Oval' : 'Road', i === 0 ? 4 : 12) })));
  // One oval race (20 corners) and two road races (240): 36 incidents over 260 corners.
  assert.equal(near(by(mixed.drivers, 1).ipc), near(36 / 260));
  // Dirt ovals are ovals too.
  assert.equal(countedCorners({ category: 'Dirt Oval', corners: 4 }), 2);
  assert.equal(countedCorners({ category: 'Road', corners: 12 }), 12);
  assert.equal(countedCorners({ category: 'Road', corners: null }), null);
  assert.equal(countedCorners(undefined), null);
});

test('a race whose event has no corner count on file does not count toward the window', () => {
  const docs = [
    doc(1, [{ kind: 'feature', results: [res(1, 1, 20, { incidents: 2, laps: 20 })] }]),
    doc(2, [{ kind: 'feature', results: [res(1, 1, 20, { incidents: 40, laps: 20 })] }], { track: { name: 'T', config: null, category: 'Road', corners: null } }),
    doc(3, [{ kind: 'feature', results: [res(1, 1, 20, { incidents: 2, laps: 20 })] }]),
  ];
  const d1 = by(fold(docs).drivers, 1);
  assert.equal(d1.history, 2);
  assert.equal(near(d1.ipc), 0.1);
  // ...and the same when it sits in the history.
  const h = by(fold(docs.slice(2), { history: docs.slice(0, 2) }).drivers, 1);
  assert.equal(h.history, 2);
});

test('under MIN_RACES the multiplier is exactly 1 whatever the incidents, and the driver stays out of the median', () => {
  // Two clean regulars (0.05/lap) across MIN_RACES races; a newcomer who
  // joins for the last MIN_RACES - 1 of them with 40 incidents in 20 laps.
  const regular = [[1, 20, 1, 20], [2, 18, 1, 20]];
  const docs = Array.from({ length: MIN_RACES }, (_, i) => race(i + 1, i === 0 ? regular : [...regular, [3, 15, 40, 20]]));
  let { drivers } = fold(docs);
  let c = by(drivers, 3);
  assert.equal(c.history, MIN_RACES - 1);
  assert.equal(c.multiplier, 1);
  assert.equal(c.fixed, true);
  // Their rate still shows (40 in 20 laps per race), it just does not count.
  assert.equal(c.ipc, 2);
  // The regulars sit at a median of their own, so both are 1.0x.
  assert.deepEqual([by(drivers, 1).multiplier, by(drivers, 2).multiplier], [1, 1]);
  // One more race and the newcomer is calculated and shapes the median:
  // rates 0.05, 0.05, 2.0 → median 0.05, and the newcomer, the roughest, takes the floor.
  ({ drivers } = fold([...docs, race(MIN_RACES + 1, [...regular, [3, 15, 40, 20]])]));
  c = by(drivers, 3);
  assert.equal(c.history, MIN_RACES);
  assert.equal(c.fixed, false);
  assert.equal(c.ipc, 2);
  assert.equal(c.multiplier, MULT_MIN);
  // An even count takes the middle pair's mean.
  const r = (incidents) => Array.from({ length: MIN_RACES }, () => ({ incidents, corners: 20 }));
  assert.equal(multipliers([{ custId: 1, races: r(1) }, { custId: 3, races: r(40) }]).median, (0.05 + 2) / 2);
});

test('a median of zero, or nobody at MIN_RACES, leaves every multiplier at 1', () => {
  // Everyone spotless: the median is 0, and nobody can be "cleaner than it".
  const clean = fold(season([[1, 20, 0, 20], [2, 18, 0, 20]]));
  assert.deepEqual(clean.drivers.map((d) => [d.ipc, d.multiplier, d.fixed]), [[0, 1, false], [0, 1, false]]);
  assert.deepEqual(clean.drivers.map((d) => d.stake), [52.6, 47.4]);
  // One race short of the minimum: nobody is calculated.
  const early = fold(season([[1, 20, 0, 20], [2, 18, 30, 20]], MIN_RACES - 1));
  assert.deepEqual(early.drivers.map((d) => [d.multiplier, d.fixed]), [[1, true], [1, true]]);
  assert.deepEqual(early.drivers.map((d) => d.stake), [52.6, 47.4]);
});

test('zero points is zero stake whatever the multiplier', () => {
  // Driver 3 is spotless but has scored nothing (a points format paying the top two only).
  const { drivers } = fold(season([[1, 20, 5, 20], [2, 18, 5, 20], [3, 0, 0, 20]]));
  const c = by(drivers, 3);
  assert.equal(c.multiplier, MULT_MAX);
  assert.equal(c.stake, 0);
  assert.equal(Math.round(sum(drivers.map((d) => d.stake)) * 10) / 10, 100);
});

test('a race the driver completed no laps of counts toward neither MIN_RACES nor the window', () => {
  // Driver 2's second race: classified (and paid) but zero laps, so one race
  // behind driver 1 from then on. Practice and qualifying never count.
  const both = (laps2) => [res(1, 1, 20, { incidents: 2, laps: 20 }), res(2, 2, 18, { incidents: 2, laps: laps2 })];
  const docs = [
    doc(1, [{ kind: 'practice', results: [res(1, 1, 0, { incidents: 9, laps: 30 })] }, { kind: 'qualifying', results: [res(1, 1, 0, { incidents: 9, laps: 3 })] }, { kind: 'feature', results: both(20) }]),
    doc(2, [{ kind: 'feature', results: both(0) }]),
    ...Array.from({ length: MIN_RACES - 2 }, (_, i) => doc(i + 3, [{ kind: 'feature', results: both(20) }])),
  ];
  let { drivers } = fold(docs);
  assert.equal(by(drivers, 1).history, MIN_RACES);
  assert.equal(by(drivers, 1).ipc, 0.1);
  assert.equal(by(drivers, 2).history, MIN_RACES - 1);
  // Still a season race they took part in: it paid them.
  assert.equal(by(drivers, 2).races, MIN_RACES);
  assert.equal(by(drivers, 2).fixed, true);
  // The zero-lap race is out of their rate too.
  assert.equal(by(drivers, 2).ipc, 0.1);
  // A driver with no counted race at all has no rate.
  assert.equal(by(fold([doc(1, [{ kind: 'feature', results: [res(1, 1, 20, { incidents: 2, laps: 20 }), res(2, 2, 18, { incidents: 0, laps: 0 })] }])]).drivers, 2).ipc, null);
  ({ drivers } = fold([...docs, doc(MIN_RACES + 1, [{ kind: 'feature', results: both(20) }])]));
  assert.equal(by(drivers, 2).history, MIN_RACES);
  assert.equal(by(drivers, 2).ipc, 0.1);
});

test('a Standard round\'s heat and feature are one race; its qualifying is not in it', () => {
  const docs = Array.from({ length: MIN_RACES }, (_, i) => doc(i + 1, [
    { kind: 'qualifying', results: [res(1, 1, 0, { incidents: 9, laps: 4 }), res(2, 2, 0, { incidents: 9, laps: 4 })] },
    { kind: 'sprint', results: [res(1, 1, 5, { incidents: i === 0 ? 4 : 0, laps: 8 }), res(2, 2, 4, { incidents: 0, laps: 8 })] },
    { kind: 'feature', results: [res(1, 1, 20, { incidents: 0, laps: 12 }), res(2, 2, 18, { incidents: 2, laps: 12 })] },
  ]));
  const { drivers } = fold(docs);
  assert.equal(by(drivers, 1).history, MIN_RACES);
  assert.equal(by(drivers, 1).ipc, 4 / (20 * MIN_RACES));
  assert.equal(by(drivers, 2).ipc, (2 * MIN_RACES) / (20 * MIN_RACES));
});

test('the math uses the unrounded multiplier; rounding is for display only', () => {
  // Rates 0.1, 0.15, 0.2, 0.25 → median 0.175: driver 2 is a third of the
  // way to the cleanest (1.1666…x), driver 3 a third of the way to the roughest (0.8333…x).
  const pts = 60 / MIN_RACES;
  const { drivers } = fold(season([[1, pts, 1, 10], [2, pts, 1.5, 10], [3, pts, 2, 10], [4, pts, 2.5, 10]]));
  const b = by(drivers, 2), c = by(drivers, 3);
  assert.equal(near(b.multiplier), near(7 / 6));
  assert.equal(near(c.multiplier), near(5 / 6));
  assert.equal(multText(b.multiplier), '1.17x');
  // 60 × 7/6 = 70 of (90 + 70 + 50 + 30): 29.1666…%, shown as 29.2.
  assert.equal(near(b.points * b.multiplier), 70);
  assert.equal(b.stake, 29.2);
  assert.equal(c.stake, 20.8);
});

test('the green deepens from nothing at 1.0x to full at MULT_MAX, and never shows at or below 1.0x', () => {
  assert.equal(cleanLevel(0.5), 0);
  assert.equal(cleanLevel(1), 0);
  assert.equal(cleanLevel(1.25), 0.5);
  assert.equal(cleanLevel(MULT_MAX), 1);
  assert.equal(multText(1), '1.00x');
  assert.equal(multText(1.2), '1.20x');
});

test('the incident record spans every season: earlier races count toward the window and the minimum, in time order', () => {
  // Last season driver 1 ran MIN_RACES - 1 clean races; driver 9 raced too
  // but is not in this season. This season's one race alone would leave
  // everyone fixed; with the history driver 1 is calculated.
  const past = Array.from({ length: MIN_RACES - 1 }, (_, i) => ({ ...race(i + 1, [[1, 20, 0, 10], [9, 18, 5, 10]]), _id: `past:${i + 1}`, startTime: `2025-06-0${i + 1}T00:00:00Z` }));
  const now = [race(1, [[1, 20, 2, 10], [2, 18, 2, 10]])];
  const { drivers, steps } = fold(now, { history: past });
  assert.deepEqual(steps.map((st) => st.id), ['s:1']);
  assert.deepEqual(drivers.map((d) => d.custId).sort(), [1, 2]);
  const a = by(drivers, 1);
  assert.equal(a.races, 1);
  assert.equal(a.history, MIN_RACES);
  assert.equal(a.fixed, false);
  assert.equal(near(a.ipc), near(2 / (10 * MIN_RACES)));
  assert.equal(by(drivers, 2).fixed, true);
  // The window rolls over the whole record: WINDOW_RACES earlier rough races
  // followed by one clean one leave the clean one as a fifth of the window,
  // while WINDOW_RACES + 1 earlier ones push the oldest out.
  const rough = (n) => Array.from({ length: n }, (_, i) => ({ ...race(i + 1, [[1, 20, i === 0 ? 100 : 10, 10]]), _id: `r:${i + 1}`, startTime: `2025-0${1 + Math.floor(i / 9)}-0${1 + (i % 9)}T00:00:00Z` }));
  const win = fold([race(1, [[1, 20, 0, 10]])], { history: rough(WINDOW_RACES - 1) });
  assert.equal(near(by(win.drivers, 1).ipc), near((100 + 10 * (WINDOW_RACES - 2)) / (10 * WINDOW_RACES)));
  const rolled = fold([race(1, [[1, 20, 0, 10]])], { history: rough(WINDOW_RACES) });
  assert.equal(near(by(rolled.drivers, 1).ipc), near((10 * (WINDOW_RACES - 1)) / (10 * WINDOW_RACES)));
  // A later session outside the season (excluded from stake) still counts, after the season's earlier ones.
  const later = fold([race(1, [[1, 20, 0, 10]])], { history: [{ ...race(2, [[1, 20, 30, 10]]), _id: 'x', startTime: '2026-12-01T00:00:00Z' }, ...past] });
  assert.equal(by(later.drivers, 1).history, MIN_RACES + 1);
});

// ---- The honours ----

test('the cleanest driver is the lowest calculated rate, only when it beats the median', () => {
  const { drivers } = fold(season([[1, 20, 2, 100], [2, 18, 10, 100], [3, 15, 30, 100], [4, 10, 1, 100]]));
  assert.deepEqual(drivers.filter((d) => d.cleanest).map((d) => d.custId), [4]);
  // A tie shares it.
  const tied = fold(season([[1, 20, 1, 100], [2, 18, 10, 100], [3, 15, 30, 100], [4, 10, 1, 100]]));
  assert.deepEqual(tied.drivers.filter((d) => d.cleanest).map((d) => d.custId).sort(), [1, 4]);
  // Everyone equal (median 0, every multiplier 1): nobody is cleanest.
  assert.equal(fold(season([[1, 20, 0, 20], [2, 18, 0, 20]])).drivers.filter((d) => d.cleanest).length, 0);
  // A driver still fixed cannot be cleanest, however spotless.
  const late = fold([...season([[1, 20, 5, 100], [2, 18, 10, 100], [3, 15, 30, 100]]), race(MIN_RACES + 1, [[1, 20, 5, 100], [2, 18, 10, 100], [3, 15, 30, 100], [4, 10, 0, 100]])]);
  assert.deepEqual(late.drivers.filter((d) => d.cleanest).map((d) => d.custId), [1]);
});

test('the hot hand is the most points per championship round, over at least MIN_ROUNDS rounds raced, with a limitless rolling window', () => {
  // Driver 1 wins the first round then sits out; driver 2 is steady;
  // driver 3 scores big in a single session, which is not a round.
  const docs = [
    ...Array.from({ length: MIN_ROUNDS + 1 }, (_, i) => race(i + 1, i === 0 ? [[1, 20, 0, 10], [2, 18, 0, 10]] : [[2, 18, 0, 10], [3, 1, 0, 10]])),
    { _id: 'single', round: null, startTime: '2026-02-01T00:00:00Z', simsessions: [{ kind: 'feature', results: [res(3, 1, 100, { incidents: 0, laps: 10 })] }] },
  ];
  const { drivers } = fold(docs);
  assert.equal(by(drivers, 1).rounds, 1);
  assert.equal(by(drivers, 1).pointsPerRound, null);
  assert.equal(by(drivers, 2).rounds, MIN_ROUNDS + 1);
  assert.equal(by(drivers, 2).pointsPerRound, 18);
  assert.equal(by(drivers, 3).pointsPerRound, 1);
  assert.deepEqual(drivers.filter((d) => d.hottest).map((d) => d.custId), [2]);
  // A finale's multiplier does not inflate the average: the round's own points count.
  const doubled = fold(docs, { multiplier: (d) => (d.round === 2 ? 2 : 1) });
  assert.equal(by(doubled.drivers, 2).pointsPerRound, 18);
  // Rounds of another series inside the season are sessions, not this
  // season's rounds, but they are still championship rounds on the record.
  const other = fold(docs, { isRound: () => false });
  assert.equal(other.drivers.filter((d) => d.hottest).length, 0);
  assert.equal(by(other.drivers, 2).rounds, 0);
  // Last season's rounds count, and only the last WINDOW_RACES rounds are
  // averaged: driver 1 won MIN_ROUNDS rounds last season and then scored 1
  // in WINDOW_RACES of this season's, so the wins have rolled out.
  const past = Array.from({ length: MIN_ROUNDS }, (_, i) => ({ ...race(i + 1, [[1, 20, 0, 10], [2, 2, 0, 10]]), _id: `past:${i + 1}`, seriesSlug: 'last-season', startTime: `2025-06-0${i + 1}T00:00:00Z` }));
  const now = Array.from({ length: WINDOW_RACES }, (_, i) => race(i + 1, [[1, 1, 0, 10], [2, 5, 0, 10]]));
  const rolled = fold(now, { history: past });
  assert.equal(by(rolled.drivers, 1).rounds, MIN_ROUNDS + WINDOW_RACES);
  assert.equal(by(rolled.drivers, 1).pointsPerRound, 1);
  assert.equal(by(rolled.drivers, 2).pointsPerRound, 5);
  assert.deepEqual(rolled.drivers.filter((d) => d.hottest).map((d) => d.custId), [2]);
  // With only one of this season's rounds run, the past wins still carry: driver 1 leads.
  const early = fold(now.slice(0, 1), { history: past });
  assert.equal(by(early.drivers, 1).pointsPerRound, (20 * MIN_ROUNDS + 1) / (MIN_ROUNDS + 1));
  assert.deepEqual(early.drivers.filter((d) => d.hottest).map((d) => d.custId), [1]);
  // A past single session (no round) is not on the round record.
  const single = fold(now.slice(0, 1), { history: [{ ...race(9, [[1, 50, 0, 10]]), _id: 'ps', round: null, seriesSlug: null, startTime: '2025-01-01T00:00:00Z' }] });
  assert.equal(by(single.drivers, 1).rounds, 1);
});
