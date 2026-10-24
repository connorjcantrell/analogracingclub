import test from 'node:test';
import assert from 'node:assert/strict';
import { startEpoch, wallClock } from '../src/lib/format.js';

test('a Pacific wall-clock time resolves to the right instant, through DST', () => {
  // 7:30 PM PDT (UTC-7) on 2026-10-24 is 02:30Z the next day.
  assert.equal(new Date(startEpoch('2026-10-24T19:30')).toISOString(), '2026-10-25T02:30:00.000Z');
  // After the fall-back on 2026-11-01 the same wall-clock is PST (UTC-8).
  assert.equal(new Date(startEpoch('2026-11-07T19:30')).toISOString(), '2026-11-08T03:30:00.000Z');
  assert.equal(startEpoch('not a time'), null);
});

test('wallClock is the inverse of startEpoch, for a picker to prefill', () => {
  for (const s of ['2026-10-24T19:30', '2026-11-07T19:30', '2026-03-08T01:59']) {
    assert.equal(wallClock(startEpoch(s)), s);
  }
  assert.equal(wallClock('2026-10-25T02:30:00.000Z'), '2026-10-24T19:30');
  assert.equal(wallClock('garbage'), '');
});
