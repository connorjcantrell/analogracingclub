import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexEvents, kindOf, KINDS, roundNeighbours } from '../src/lib/server/results.js';

const seasons = [
  { slug: 'fall-2026', name: 'Fall 2026', startsAt: '2026-09-01T07:00:00Z', endsAt: null },
  { slug: 'winter-26-27', name: 'Winter 26/27', startsAt: '2026-11-01T07:00:00Z', endsAt: null },
];
const series = [{
  slug: 'fall-2026-series', name: 'Fall 2026 Series', eventType: 'league-fast-four', season: 'fall-2026',
  pointsConfig: { qualifying: { base: { 1: 4, 2: 3, 3: 2, 4: 1 } } },
  schedule: [{ round: 1, track: 'Spa', date: '2026-09-10', multiplier: 1 }, { round: 2, track: 'Monza', date: '2026-09-17', multiplier: 2 }, { round: 3, track: 'Suzuka', date: '2026-09-24', multiplier: 1 }],
}];
const docs = [
  { _id: 'r1', seriesSlug: 'fall-2026-series', round: 1, startTime: '2026-09-10T20:00:00Z', simsessions: [] },
  { _id: 'r2', seriesSlug: 'fall-2026-series', round: 2, startTime: '2026-09-17T20:00:00Z', simsessions: [] },
  { _id: 'h1', seriesSlug: null, eventType: 'hosted-qual-race', title: 'Hosted at Daytona', startTime: '2026-09-20T20:00:00Z', simsessions: [] },
  { _id: 'x1', seriesSlug: null, eventType: 'special-qual-race', title: 'Bathurst 1000', startTime: '2026-11-05T20:00:00Z', simsessions: [] },
  { _id: 'old', seriesSlug: null, eventType: 'hosted-qual-race', title: 'Before any season', startTime: '2026-01-05T20:00:00Z', simsessions: [] },
];

test('kindOf: a series round is league; a standalone is single, or special by its type', () => {
  assert.equal(kindOf(docs[0], series[0]), 'league');
  assert.equal(kindOf(docs[2], null), 'single');
  assert.equal(kindOf(docs[3], null), 'special');
  assert.equal(kindOf({ eventType: 'nope' }, null), 'single');
  assert.deepEqual(KINDS.map((k) => k.id), ['league', 'single', 'special']);
});

test('indexEvents lists every race newest first, filed to the season its date falls in', () => {
  const { events, upcoming } = indexEvents({ docs, series, seasons });
  assert.deepEqual(events.map((e) => e.id), ['x1', 'h1', 'r2', 'r1', 'old']);
  assert.deepEqual(events.map((e) => e.season), ['winter-26-27', 'fall-2026', 'fall-2026', 'fall-2026', null]);
  const r2 = events.find((e) => e.id === 'r2');
  assert.equal(r2.kind, 'league');
  assert.equal(r2.seriesName, 'Fall 2026 Series');
  assert.equal(r2.multiplier, 2);
  assert.equal(r2.qualifyingPlaces, 4);
  assert.equal(r2.sub.eventType.id, 'league-fast-four');
  const h1 = events.find((e) => e.id === 'h1');
  assert.equal(h1.round, null);
  assert.equal(h1.qualifyingPlaces, 0);
  assert.equal(h1.sub.eventType.id, 'hosted-qual-race');
  // Only the round with no result is still to come.
  assert.deepEqual(upcoming, [{ seriesSlug: 'fall-2026-series', seriesName: 'Fall 2026 Series', season: 'fall-2026', round: 3, track: 'Suzuka', date: '2026-09-24' }]);
});

test('indexEvents attaches each event its videos', () => {
  const videos = new Map([['r1', [{ id: 'v' }]]]);
  const { events } = indexEvents({ docs, series, seasons, videos });
  assert.deepEqual(events.find((e) => e.id === 'r1').sub.videos, [{ id: 'v' }]);
  assert.deepEqual(events.find((e) => e.id === 'r2').sub.videos, []);
});

test('roundNeighbours names the round before and after, by round order, and nothing past either end', () => {
  const rounds = [
    { _id: 'r3', round: 3, track: { name: 'Suzuka' }, startTime: '2026-09-24T20:00:00Z' },
    { _id: 'r1', round: 1, track: { name: 'Spa' }, startTime: '2026-09-10T20:00:00Z' },
    { _id: 'r2', round: 2, track: { name: 'Monza' }, startTime: '2026-09-17T20:00:00Z' },
  ];
  assert.deepEqual(roundNeighbours(rounds, 'r2'), {
    prev: { id: 'r1', round: 1, track: { name: 'Spa' } },
    next: { id: 'r3', round: 3, track: { name: 'Suzuka' } },
  });
  assert.equal(roundNeighbours(rounds, 'r1').prev, null);
  assert.equal(roundNeighbours(rounds, 'r3').next, null);
  assert.deepEqual(roundNeighbours(rounds, 'missing'), { prev: null, next: null });
});
