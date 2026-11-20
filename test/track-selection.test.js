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

// ---- Opting out and the community vote -----------------------------------
import { cleanStakes, stakeShares, tallyStakes, liveBallot, voteView } from '../src/lib/server/track-selection/index.js';

test('a ballot stakes on eligible layouts of tracks no driver holds', () => {
  const tracks = eligibleTracks(catalog, ['Road Course', 'Short Track', 'Speedway']);
  const held = new Set(['bristol']);
  assert.deepEqual(cleanStakes(tracks, held, { 'charlotte:11': '2', 'charlotte:10': '1', 'bristol:20': '0' }), { counts: { 'charlotte:11': 2, 'charlotte:10': 1 }, clicks: 3 }, 'two layouts of one track are two combos; zeros are dropped');
  assert.throws(() => cleanStakes(tracks, held, { 'bristol:20': '1' }), /already holds that track/);
  assert.throws(() => cleanStakes(tracks, held, { 'charlotte:99': '1' }), /not on offer/);
  assert.throws(() => cleanStakes(eligibleTracks(catalog, ['Road Course']), held, { 'charlotte:10': '1' }), /not on offer/, 'the oval is not an allowed type here');
  assert.throws(() => cleanStakes(tracks, held, { 'charlotte:11': '-1' }), /non-negative/);
  assert.throws(() => cleanStakes(tracks, held, { 'charlotte:11': '1.5' }), /whole/);
});

test('clicks split a stake evenly: one click is all of it, two combos are 50/50, two-and-one is thirds', () => {
  assert.deepEqual(stakeShares({ counts: { a: 1 }, stake: 12 }), { a: 12 });
  assert.deepEqual(stakeShares({ counts: { a: 1, b: 1 }, stake: 12 }), { a: 6, b: 6 });
  assert.deepEqual(stakeShares({ counts: { a: 2, b: 1 }, stake: 12 }), { a: 8, b: 4 });
  assert.deepEqual(stakeShares({ counts: {}, stake: 12 }), {}, 'no clicks, nothing staked');
});

test('the tally sums each combo\'s stake, counts its backers, and drops tracks drivers have since taken', () => {
  const { totals, backers, voters, staked } = tallyStakes([
    { clicks: 2, stake: 10, counts: { 'a:1': 1, 'b:1': 1 } },
    { clicks: 3, stake: 9, counts: { 'a:1': 2, 'c:1': 1 } },
    { clicks: 0, stake: 20, counts: {} },
  ]);
  assert.deepEqual(totals, { 'a:1': 11, 'b:1': 5, 'c:1': 3 });
  assert.deepEqual(backers, { 'a:1': 2, 'b:1': 1, 'c:1': 1 });
  assert.equal(voters, 2, 'a ballot without a click is not a voter');
  assert.equal(staked, 19);
  const taken = tallyStakes([{ clicks: 2, stake: 10, counts: { 'a:1': 1, 'b:1': 1 } }], new Set(['b']));
  assert.deepEqual(taken.totals, { 'a:1': 10 }, 'the stake re-splits across what is left');
  assert.deepEqual(liveBallot({ clicks: 1, stake: 10, counts: { 'b:1': 1 } }, new Set(['b'])).clicks, 0, 'a ballot only on a taken track is empty');
});

test('the vote view names the staked combos and declares one winner per slot once closed', () => {
  const tracks = eligibleTracks(catalog, ['Road Course', 'Short Track']);
  const vote = { seriesSlug: 's', startsAt: new Date('2026-01-01'), endsAt: new Date('2026-01-04') };
  const selection = { vote, removed: [{ custId: 9, displayName: 'Ty' }] };
  const open = voteView(selection, tracks, null, new Date('2026-01-02'));
  assert.equal(open.status, 'open');
  assert.equal(open.winners, null);
  assert.deepEqual(open.candidates, [], 'nothing staked, nothing on the board');
  const tally = { totals: { 'bristol:20': 7.5, 'charlotte:11': 4 }, backers: {}, voters: 2, staked: 11.5 };
  const closed = voteView(selection, tracks, tally, new Date('2026-01-05'));
  assert.equal(closed.status, 'closed');
  assert.deepEqual(closed.candidates.map((c) => c.name).sort(), ['Bristol', 'Charlotte – Charlotte Roval']);
  assert.deepEqual(closed.winners.map((w) => w.track), ['Bristol']);
  const twoSlots = voteView({ ...selection, removed: [{ custId: 9 }, { custId: 8 }] }, tracks, tally, new Date('2026-01-05'));
  assert.equal(twoSlots.winners.length, 2, 'two removed drivers, two rounds from the vote');
});
