import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePoints } from '../src/scoring/calculator.js';
import { FORMATS, validatePointsConfig } from '../src/scoring/formats.js';
import { buildSubsessionDocument } from '../src/import/build-document.js';
import { sessionKind, unwrapEnvelope } from '../src/import/mappers.js';

const cfg = FORMATS['arc-standard'].pointsConfig;

test('qualifying pays 7-5-3-1 and nothing past P4', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((p) => computePoints(cfg, { kind: 'qualifying', finish: p }).total), [7, 5, 3, 1, 0]);
});

test('sprint pays 1 point for leading a lap, regardless of finish', () => {
  assert.equal(computePoints(cfg, { kind: 'sprint', finish: 1, lapsLead: 0 }).total, 0);
  assert.equal(computePoints(cfg, { kind: 'sprint', finish: 9, lapsLead: 3 }).total, 1);
});

test('feature pays 20-18-16-14-12 then down by one to P16', () => {
  const pts = Array.from({ length: 17 }, (_, i) => computePoints(cfg, { kind: 'feature', finish: i + 1 }).total);
  assert.deepEqual(pts, [20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test('session kinds map from iRacing names/types', () => {
  assert.equal(sessionKind({ simsession_type: 5, simsession_name: 'QUALIFY' }), 'qualifying');
  assert.equal(sessionKind({ simsession_type: 6, simsession_name: 'HEAT 1' }), 'sprint');
  assert.equal(sessionKind({ simsession_type: 6, simsession_name: 'FEATURE' }), 'feature');
  assert.equal(sessionKind({ simsession_type: 3, simsession_name: 'PRACTICE' }), 'practice');
});

test('unwrapEnvelope accepts the download envelope and bare results', () => {
  assert.equal(unwrapEnvelope({ type: 'event_result', data: { subsession_id: 1 } }).rawType, 'event_result');
  assert.equal(unwrapEnvelope({ subsession_id: 1 }).rawType, null);
  assert.throws(() => unwrapEnvelope({ hello: 1 }), /subsession_id/);
});

test('validatePointsConfig normalizes and rejects bad input', () => {
  const ok = validatePointsConfig({ feature: { base: { 1: 10, 2: 8 } }, sprint: { lapLedBonus: 2 } });
  assert.deepEqual(ok.feature.base, { 1: 10, 2: 8 });
  assert.equal(ok.sprint.lapLedBonus, 2);
  assert.deepEqual(ok.qualifying, { base: {} });
  assert.throws(() => validatePointsConfig({ feature: { base: { 0: 1 } } }), /positions/);
  assert.throws(() => validatePointsConfig([]), /object/);
});

// Minimal event-result: qualifying, sprint, feature, with one AI car in the middle.
const row = (cust_id, finish, start, extra = {}) => ({ cust_id, display_name: `D${cust_id}`, finish_position: finish, starting_position: start, incidents: 0, laps_lead: 0, laps_complete: 10, best_lap_time: 60000, ...extra });
const event = {
  subsession_id: 42, track: { track_id: 1, track_name: 'Sonoma', config_name: 'Cup' }, start_time: '2026-09-01T01:00:00Z',
  session_results: [
    { simsession_number: -4, simsession_type: 5, simsession_name: 'QUALIFY', results: [row(1, 0, 0), row(9, 1, 1, { ai: true }), row(2, 2, 2), row(3, 3, 3)] },
    { simsession_number: -3, simsession_type: 6, simsession_name: 'HEAT 1', results: [row(2, 0, 0, { laps_lead: 4 }), row(1, 1, 1, { laps_lead: 2 }), row(3, 2, 2)] },
    { simsession_number: 0, simsession_type: 6, simsession_name: 'FEATURE', results: [row(3, 0, 2), row(1, 1, 1), row(2, 2, 0, { finish_position: -1 })] },
  ],
};

test('buildSubsessionDocument drops AI, re-ranks, and scores each kind', () => {
  const doc = buildSubsessionDocument(event, { seriesSlug: 'fall', round: 2, pointsConfig: cfg, rawType: 'event_result' });
  assert.equal(doc._id, 'fall:42');
  assert.equal(doc.round, 2);
  const qual = doc.simsessions.find((s) => s.kind === 'qualifying');
  // AI car (cust 9) removed; cust 2 moves up from P3 to P2.
  assert.deepEqual(qual.results.map((r) => [r.custId, r.finish, r.points.total]), [[1, 1, 7], [2, 2, 5], [3, 3, 3]]);
  const sprint = doc.simsessions.find((s) => s.kind === 'sprint');
  assert.deepEqual(sprint.results.map((r) => [r.custId, r.points.total]), [[2, 1], [1, 1], [3, 0]]);
  const feature = doc.simsessions.find((s) => s.kind === 'feature');
  assert.deepEqual(feature.results.map((r) => [r.custId, r.finish, r.points.total]), [[3, 1, 20], [1, 2, 18], [2, null, 0]]);
  assert.equal(doc.raw, event);
});

test('the lap-led bonus pays once per round, not once per race', () => {
  // cust 1 leads BOTH races, cust 2 the sprint only, cust 3 the feature only.
  const ev = {
    subsession_id: 43, track: { track_id: 1, track_name: 'Sonoma' },
    session_results: [
      { simsession_number: -3, simsession_type: 6, simsession_name: 'HEAT 1',
        results: [row(1, 0, 0, { laps_lead: 5 }), row(2, 1, 1, { laps_lead: 3 }), row(3, 2, 2)] },
      { simsession_number: 0, simsession_type: 6, simsession_name: 'FEATURE',
        results: [row(1, 0, 0, { laps_lead: 6 }), row(3, 1, 1, { laps_lead: 4 }), row(2, 2, 2)] },
    ],
  };
  const doc = buildSubsessionDocument(ev, { pointsConfig: cfg });
  const bonusFor = (id) => doc.simsessions
    .filter((s) => s.kind === 'sprint' || s.kind === 'feature')
    .flatMap((s) => s.results)
    .filter((r) => r.custId === id)
    .reduce((n, r) => n + r.points.bonus, 0);

  assert.equal(bonusFor(1), 1, 'leading both races still pays a single point');
  assert.equal(bonusFor(2), 1, 'sprint-only leader is paid');
  assert.equal(bonusFor(3), 1, 'feature-only leader is paid');

  // The point lands on the first race led, and base points are untouched.
  const sprint = doc.simsessions.find((s) => s.kind === 'sprint');
  const feature = doc.simsessions.find((s) => s.kind === 'feature');
  assert.equal(sprint.results.find((r) => r.custId === 1).points.bonus, 1);
  assert.equal(feature.results.find((r) => r.custId === 1).points.bonus, 0);
  assert.equal(feature.results.find((r) => r.custId === 1).points.total, 20);
});

test('an entrant who completed no laps is dropped from that session', () => {
  // iRacing lists every registered driver in every session and gives each a
  // finish_position, even one who never left the pits. Cust 4 sat out
  // qualifying but raced; cust 5 signed up and turned no laps at all.
  const ev = {
    subsession_id: 44, track: { track_id: 1, track_name: 'Sonoma' },
    session_results: [
      { simsession_number: -4, simsession_type: 5, simsession_name: 'QUALIFY',
        results: [row(1, 0, 0), row(2, 1, 1), row(4, 2, 2, { laps_complete: 0 }), row(5, 3, 3, { laps_complete: 0 })] },
      { simsession_number: 0, simsession_type: 6, simsession_name: 'FEATURE',
        results: [row(1, 0, 0), row(4, 1, 2), row(2, 2, 1), row(5, 3, 3, { laps_complete: 0, reason_out: 'Disconnected' })] },
    ],
  };
  const doc = buildSubsessionDocument(ev, { pointsConfig: cfg });
  const ids = (kind) => doc.simsessions.find((s) => s.kind === kind).results.map((r) => r.custId);

  assert.deepEqual(ids('qualifying'), [1, 2], 'both no-shows drop out of qualifying');
  assert.deepEqual(ids('feature'), [1, 4, 2], 'cust 4 counts in the race they actually ran');
  assert.ok(!ids('feature').includes(5), 'the driver who never ran is absent entirely');

  // Positions are re-ranked among real participants, so nobody inherits a
  // placing from a car that was never on track.
  const feature = doc.simsessions.find((s) => s.kind === 'feature');
  assert.deepEqual(feature.results.map((r) => [r.custId, r.finish]), [[1, 1], [4, 2], [2, 3]]);
});
