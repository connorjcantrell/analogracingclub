import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickChampionship, cleanestOf, pickStakeSeason } from '../src/lib/server/home.js';

// Three seasons, each with a championship series; which one the homepage
// shows depends on what has raced.
const seasons = [
  { slug: 'spring', name: 'Spring', startsAt: '2026-03-01T00:00:00Z' },
  { slug: 'summer', name: 'Summer', startsAt: '2026-06-01T00:00:00Z' },
  { slug: 'fall', name: 'Fall', startsAt: '2026-09-01T00:00:00Z' },
];
const series = [
  { slug: 'spring-gt', season: 'spring', eventType: 'league-fast-four', status: 'complete' },
  { slug: 'summer-gt', season: 'summer', eventType: 'league-fast-four', status: 'complete' },
  { slug: 'fall-gt', season: 'fall', eventType: 'league-fast-four', status: 'active' },
  { slug: 'fall-cup', season: 'fall', eventType: 'hosted-qual-race', status: 'active' },
];
const inFall = new Date('2026-10-01T00:00:00Z');

test('the current season’s championship, once it has raced', () => {
  const roundsRun = new Map([['summer-gt', 8], ['fall-gt', 1]]);
  assert.equal(pickChampionship({ seasons, series, roundsRun, now: inFall })?.slug, 'fall-gt');
});

test('the season before, while the current one has not raced', () => {
  const roundsRun = new Map([['spring-gt', 8], ['summer-gt', 8]]);
  assert.equal(pickChampionship({ seasons, series, roundsRun, now: inFall })?.slug, 'summer-gt');
});

test('back past a season with no raced championship', () => {
  const roundsRun = new Map([['spring-gt', 8]]);
  assert.equal(pickChampionship({ seasons, series, roundsRun, now: inFall })?.slug, 'spring-gt');
});

test('never a single-session series, and null with nothing raced', () => {
  assert.equal(pickChampionship({ seasons, series, roundsRun: new Map([['fall-cup', 3]]), now: inFall }), null);
  assert.equal(pickChampionship({ seasons, series, roundsRun: new Map(), now: inFall }), null);
});

test('with no season filed, the championship that raced most recently', () => {
  const loose = [
    { slug: 'a', season: null, eventType: 'league-fast-four', status: 'complete' },
    { slug: 'b', season: null, eventType: 'league-fast-four', status: 'complete' },
  ];
  const latest = new Map([['a', '2026-05-01T00:00:00Z'], ['b', '2026-07-01T00:00:00Z']]);
  assert.equal(pickChampionship({ seasons: [], series: loose, roundsRun: new Map([['a', 2], ['b', 2]]), latest })?.slug, 'b');
});

// ---- The race's cleanest driver ----
const row = (custId, finish, { incidents = 0, laps = 10, reasonOut = 'Running' } = {}) =>
  ({ custId, displayName: `Driver ${custId}`, finish, incidents, lapsComplete: laps, reasonOut });
const race = (...sessions) => ({ simsessions: sessions });

test('cleanest: the fewest incidents per lap among drivers who completed the race', () => {
  const sub = race({ kind: 'feature', results: [row(1, 1, { incidents: 4 }), row(2, 2, { incidents: 1 }), row(3, 3, { incidents: 2 })] });
  assert.deepEqual(cleanestOf(sub), { custId: 2, name: 'Driver 2', incidents: 1, laps: 10 });
});

test('cleanest: a driver who did not finish is out, however clean; heat and feature count together', () => {
  const sub = race(
    { kind: 'sprint', results: [row(1, 1, { incidents: 3, laps: 5 }), row(2, 2, { incidents: 0, laps: 5 })] },
    { kind: 'feature', results: [row(1, 1, { incidents: 0 }), row(2, 2, { incidents: 0, laps: 3, reasonOut: 'Disconnected' })] },
  );
  assert.deepEqual(cleanestOf(sub), { custId: 1, name: 'Driver 1', incidents: 3, laps: 15 });
});

test('cleanest: ties go to more laps, then the better finish; an older result falls back to the winner’s laps', () => {
  const tie = race({ kind: 'feature', results: [row(1, 1, { incidents: 0 }), row(2, 2, { incidents: 0 })] });
  assert.equal(cleanestOf(tie).custId, 1);
  const old = race({ kind: 'feature', results: [row(1, 1, { incidents: 2, reasonOut: null }), row(2, 2, { incidents: 0, laps: 9, reasonOut: null })] });
  assert.equal(cleanestOf(old).custId, 1);
  // Qualifying never counts, and a race nobody completed names no one.
  assert.equal(cleanestOf(race({ kind: 'qualifying', results: [row(1, 1)] })), null);
  assert.equal(cleanestOf(race({ kind: 'feature', results: [row(1, 1, { reasonOut: 'Disqualified' })] })), null);
});

// ---- Which season the stake card shows ----
test('stake season: the one running now, else the latest started, else the newest', () => {
  assert.equal(pickStakeSeason(seasons, inFall)?.slug, 'fall');
  const gap = [{ slug: 'spring', startsAt: '2026-03-01T00:00:00Z', endsAt: '2026-04-01T00:00:00Z' }, { slug: 'winter', startsAt: '2027-01-01T00:00:00Z' }];
  assert.equal(pickStakeSeason(gap, new Date('2026-06-01T00:00:00Z'))?.slug, 'spring');
  assert.equal(pickStakeSeason([{ slug: 'winter', startsAt: '2027-01-01T00:00:00Z' }], inFall)?.slug, 'winter');
  assert.equal(pickStakeSeason([], inFall), null);
});
