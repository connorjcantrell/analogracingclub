import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanScheduleRows, cleanResultPost } from '../src/lib/server/posts.js';
import { fmtStartTime } from '../src/lib/format.js';

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
