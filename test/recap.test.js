import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultPostTitle } from '../src/lib/server/recap.js';
import { publicDescriptor } from '../src/lib/server/event-types.js';

// Minimal fixtures — the title only reads simsessions, eventType, and track/title.
const row = (custId, name, finish, total, extra = {}) =>
  ({ custId, displayName: name, finish, points: { total }, ...extra });

// A league round where the round winner (Andrew, most points) is NOT the
// feature winner (Chris).
const leagueSub = () => ({
  title: null,
  track: { name: 'WeatherTech Raceway at Laguna Seca', config: '2026' },
  startTime: '2026-09-17T23:00:00Z',
  eventType: publicDescriptor('league-fast-four'),
  simsessions: [
    { kind: 'qualifying', results: [row(2, 'Ben Carter', 1, 7), row(1, 'Andrew Bowman', 2, 5), row(3, 'Chris Dodd', 3, 3)] },
    { kind: 'sprint', results: [row(1, 'Andrew Bowman', 1, 10), row(2, 'Ben Carter', 2, 8), row(3, 'Chris Dodd', 3, 6)] },
    { kind: 'feature', results: [row(3, 'Chris Dodd', 1, 20), row(1, 'Andrew Bowman', 2, 18), row(2, 'Ben Carter', 3, 14)] },
  ],
});
// totals: Andrew 33, Chris 29, Ben 29 → round winner Andrew, feature winner Chris.

const leagueSeries = { slug: 'season-2', name: 'Season 2', typeLabel: 'League', singleRound: false, qualifyingPlaces: 4 };

test('a league title names the round winner and the feature winner when they differ', () => {
  assert.equal(
    resultPostTitle(leagueSeries, leagueSub()),
    'Andrew Bowman wins round with Chris Dodd taking the feature win at WeatherTech Raceway at Laguna Seca');
});

test('a league title omits the feature winner when it is the round winner', () => {
  const sub = leagueSub();
  // Give Andrew the feature win too (but not the most laps led — no lap data).
  sub.simsessions[2].results = [row(1, 'Andrew Bowman', 1, 20), row(3, 'Chris Dodd', 2, 18), row(2, 'Ben Carter', 3, 14)];
  assert.equal(resultPostTitle(leagueSeries, sub), 'Andrew Bowman wins round at WeatherTech Raceway at Laguna Seca');
});

test('a round + feature win with the most laps led reads "dominates"', () => {
  const sub = leagueSub();
  // Andrew wins the round, wins the feature, and leads the most laps in it.
  sub.simsessions[2].results = [
    row(1, 'Andrew Bowman', 1, 20, { lapsLead: 15 }),
    row(3, 'Chris Dodd', 2, 18, { lapsLead: 2 }),
    row(2, 'Ben Carter', 3, 14),
  ];
  assert.equal(resultPostTitle(leagueSeries, sub), 'Andrew Bowman dominates at WeatherTech Raceway at Laguna Seca');
});

// A one-off special: no series, so the simple "<name> wins <event>" form.
const specialSub = () => ({
  title: 'Bathurst 1000',
  track: { name: 'Mount Panorama', config: null },
  startTime: '2026-08-01T23:00:00Z',
  eventType: publicDescriptor('hosted-qual-race'),
  simsessions: [
    { kind: 'qualifying', results: [row(2, 'Ben Carter', 1, 0), row(1, 'Andrew Bowman', 2, 0)] },
    { kind: 'feature', results: [row(1, 'Andrew Bowman', 1, 0), row(2, 'Ben Carter', 2, 0)] },
  ],
});

test('a special event is titled "<name> wins <event>"', () => {
  assert.equal(resultPostTitle(null, specialSub()), 'Andrew Bowman wins Bathurst 1000');
});
