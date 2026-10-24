import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSelection, eligibleTracks, cleanPick, assertTrackFree, NOTES_MAX } from '../src/lib/server/track-selection/index.js';

const drivers = [{ _id: 1, displayName: 'Ann' }, { _id: 2, displayName: 'Bo' }, { _id: 3, displayName: 'Cy' }];
const catalog = [
  { _id: 'charlotte', name: 'Charlotte', configs: [
    { srhConfigId: 10, name: 'Oval', shortName: 'Charlotte Oval', type: 'Speedway', lengthMi: 1.5, turns: 4 },
    { srhConfigId: 11, name: 'Roval', shortName: 'Charlotte Roval', type: 'Road Course', lengthMi: 2.28, turns: 17 },
  ] },
  { _id: 'bristol', name: 'Bristol', configs: [{ srhConfigId: 20, name: null, shortName: 'Bristol', type: 'Short Track', lengthMi: 0.533, turns: 4 }] },
];

test('a selection needs a title, known track types and known drivers, kept in the given order', () => {
  const s = cleanSelection({ title: ' Winter tracks ', trackTypes: ['Speedway', 'Road Course', 'Speedway'], custIds: ['3', '1'] }, { drivers });
  assert.equal(s.title, 'Winter tracks');
  assert.deepEqual(s.trackTypes, ['Road Course', 'Speedway'], 'types follow the catalog order, deduplicated');
  assert.deepEqual(s.drivers, [{ custId: 3, displayName: 'Cy' }, { custId: 1, displayName: 'Ann' }]);
  assert.throws(() => cleanSelection({ title: '', trackTypes: ['Road Course'], custIds: [1] }, { drivers }), /title/);
  assert.throws(() => cleanSelection({ title: 'x', trackTypes: [], custIds: [1] }, { drivers }), /track type/);
  assert.throws(() => cleanSelection({ title: 'x', trackTypes: ['Kart'], custIds: [1] }, { drivers }), /Unknown track type/);
  assert.throws(() => cleanSelection({ title: 'x', trackTypes: ['Road Course'], custIds: [] }, { drivers }), /at least one driver/);
  assert.throws(() => cleanSelection({ title: 'x', trackTypes: ['Road Course'], custIds: [9] }, { drivers }), /Unknown driver #9/);
});

test('eligibleTracks keeps only layouts of the allowed types and drops emptied tracks', () => {
  const road = eligibleTracks(catalog, ['Road Course']);
  assert.deepEqual(road.map((t) => [t._id, t.configs.map((c) => c.srhConfigId)]), [['charlotte', [11]]]);
  assert.equal(eligibleTracks(catalog, ['Short Track', 'Speedway']).length, 2);
  assert.equal(eligibleTracks(catalog, ['Rallycross']).length, 0);
});

test('a pick names an eligible track and layout, a weather, a format, and a short note', () => {
  const tracks = eligibleTracks(catalog, ['Road Course', 'Short Track']);
  const base = { trackId: 'charlotte', configId: '11', weather: 'dry-to-wet', variation: 'long', notes: '  Night  race \n please ' };
  assert.deepEqual(cleanPick(tracks, base), { trackId: 'charlotte', configId: 11, weather: 'dry-to-wet', variation: 'long', notes: 'Night race please' });
  assert.deepEqual(cleanPick(tracks, { ...base, trackId: 'bristol', configId: 20, notes: undefined }).notes, '');
  assert.throws(() => cleanPick(tracks, { ...base, trackId: 'nope' }), /Pick a track/);
  assert.throws(() => cleanPick(tracks, { ...base, configId: '10' }), /layout of Charlotte/, 'the oval is not an allowed type here');
  assert.throws(() => cleanPick(tracks, { ...base, weather: 'snow' }), /weather/);
  assert.throws(() => cleanPick(tracks, { ...base, variation: 'sprint' }), /Standard or Long/);
  assert.throws(() => cleanPick(tracks, { ...base, notes: 'x'.repeat(NOTES_MAX + 1) }), /150 characters/);
  assert.equal(cleanPick(tracks, { ...base, notes: 'é'.repeat(NOTES_MAX) }).notes.length, NOTES_MAX, 'the limit counts characters, not bytes');
});

test('a track can be held by one driver per selection, whatever the layout', () => {
  const saved = [{ custId: 1, trackId: 'charlotte', configId: 10 }, { custId: 2, trackId: 'bristol', configId: 20 }];
  const roster = [{ custId: 1, displayName: 'Ann' }, { custId: 2, displayName: 'Bo' }];
  assert.throws(() => assertTrackFree(saved, { custId: 3, trackId: 'charlotte' }, roster), /Ann already has that track/, 'a different layout of the same track is still the same track');
  assert.doesNotThrow(() => assertTrackFree(saved, { custId: 1, trackId: 'charlotte' }), 'a driver may re-save their own track');
  assert.doesNotThrow(() => assertTrackFree(saved, { custId: 3, trackId: 'sebring' }));
  assert.throws(() => assertTrackFree(saved, { custId: 3, trackId: 'bristol' }), /another driver already has/, 'without the roster the message stays generic');
});
