import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanScheduleRows, cleanResultPost } from '../src/lib/server/posts.js';
import { fmtStartTime, startEpoch, countdown } from '../src/lib/format.js';

test('cleanScheduleRows coerces rows and trims strings', () => {
  const out = cleanScheduleRows([
    { round: 1, track: '  Lime Rock ', config: 'Classic', date: '9/17' },
    { track: 'Sebring', config: '', date: '' },
  ]);
  assert.deepEqual(out, [
    { round: 1, track: 'Lime Rock', config: 'Classic', date: '9/17' },
    { round: 2, track: 'Sebring', config: null, date: null },
  ]);
});

test('cleanScheduleRows drops fully blank rows but keeps partial ones', () => {
  const out = cleanScheduleRows([
    { round: 1, track: '', config: '', date: '' },
    { round: 2, track: '', config: '', date: 'TBA' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, 'TBA');
});

test('cleanScheduleRows tolerates non-array input', () => {
  assert.deepEqual(cleanScheduleRows(undefined), []);
  assert.deepEqual(cleanScheduleRows(null), []);
  assert.deepEqual(cleanScheduleRows('nope'), []);
});

test('cleanResultPost trims, caps and only touches the fields given', () => {
  assert.deepEqual(cleanResultPost({ postTitle: '  Big night at Sebring ' }), { postTitle: 'Big night at Sebring' });
  assert.deepEqual(cleanResultPost({ postBody: ' x '.repeat(3000) }).postBody.length, 4000);
  // An empty string clears the field (the route unsets it); undefined leaves it alone.
  assert.deepEqual(cleanResultPost({ postTitle: '', postBody: undefined }), { postTitle: '' });
  assert.deepEqual(cleanResultPost({}), {});
  assert.deepEqual(cleanResultPost(null), {});
});

test('fmtStartTime renders a local wall-clock start without zone conversion', () => {
  assert.equal(fmtStartTime('2026-09-17T19:30'), 'Thu, Sep 17, 7:30 PM');
  assert.equal(fmtStartTime('2026-01-05T09:05'), 'Mon, Jan 5, 9:05 AM');
  assert.equal(fmtStartTime(''), null);
  assert.equal(fmtStartTime('2026-09-17'), null);
});

test('startEpoch reads a wall-clock start in the league zone, across DST', () => {
  // 7:30 PM Pacific Daylight Time is 02:30 UTC the next day; PST in December is 03:30.
  assert.equal(new Date(startEpoch('2026-09-17T19:30')).toISOString(), '2026-09-18T02:30:00.000Z');
  assert.equal(new Date(startEpoch('2026-12-17T19:30')).toISOString(), '2026-12-18T03:30:00.000Z');
  assert.equal(startEpoch('nope'), null);
});

test('countdown steps from days to hours to minutes, and hides otherwise', () => {
  const start = startEpoch('2026-09-17T19:30');
  const H = 3_600_000;
  assert.equal(countdown('2026-09-17T19:30', start - 3 * 24 * H), 'in 3 days');
  assert.equal(countdown('2026-09-17T19:30', start - 26 * H), 'in 1 day');
  assert.equal(countdown('2026-09-17T19:30', start - 5 * H), 'in 5 hours');
  assert.equal(countdown('2026-09-17T19:30', start - 50 * 60_000), 'in 50 minutes');
  assert.equal(countdown('2026-09-17T19:30', start - 20_000), 'in 1 minute');
  assert.equal(countdown('2026-09-17T19:30', start - 8 * 24 * H), null);
  assert.equal(countdown('2026-09-17T19:30', start + 1), null);
  assert.equal(countdown(null, start), null);
});
