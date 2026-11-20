import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonWindows, seasonAt, seasonConflict } from '../src/lib/seasons.js';

const s = (slug, startsAt, endsAt = null) => ({ slug, name: slug, startsAt, endsAt });
const fall = s('fall-2026', '2026-09-01T07:00:00Z');
const winter = s('winter-2027', '2027-01-05T08:00:00Z');
const spring = s('spring-2027', '2027-04-01T07:00:00Z', '2027-06-30T07:00:00Z');

test('an open-ended season runs until the next one starts; an explicit end is kept', () => {
  const w = seasonWindows([spring, fall, winter]);
  assert.deepEqual(w.map((x) => [x.slug, x.endsAtEffective]), [
    ['fall-2026', winter.startsAt], ['winter-2027', spring.startsAt], ['spring-2027', spring.endsAt],
  ]);
});

test('seasonAt files an instant into the season whose window holds it', () => {
  const all = [fall, winter, spring];
  assert.equal(seasonAt(all, '2026-10-10T02:00:00Z')?.slug, 'fall-2026');
  assert.equal(seasonAt(all, winter.startsAt)?.slug, 'winter-2027'); // start is inclusive
  assert.equal(seasonAt(all, '2027-03-31T23:00:00Z')?.slug, 'winter-2027');
  assert.equal(seasonAt(all, '2027-07-01T00:00:00Z'), null); // after an explicit end: no season
  assert.equal(seasonAt(all, '2026-01-01T00:00:00Z'), null); // before the first
  assert.equal(seasonAt(all, null), null);
  assert.equal(seasonAt([], '2026-10-10T02:00:00Z'), null);
});

test('seasons never overlap', () => {
  assert.equal(seasonConflict(s('summer-2027', '2027-07-01T07:00:00Z'), [fall, winter, spring]), null);
  // Slotting one between two open-ended seasons just shortens the earlier one.
  assert.equal(seasonConflict(s('late-fall', '2026-11-01T07:00:00Z'), [fall, winter]), null);
  assert.match(seasonConflict(s('clash', winter.startsAt), [fall, winter]), /same day/);
  // An explicit end that runs past the next start is an overlap.
  assert.match(seasonConflict(s('long', '2026-06-01T07:00:00Z', '2026-10-01T07:00:00Z'), [fall]), /still be running/);
  assert.match(seasonConflict(s('mid', '2027-05-01T07:00:00Z'), [spring]), /still be running/);
  assert.match(seasonConflict(s('bad', '2027-05-01T07:00:00Z', '2027-05-01T07:00:00Z'), []), /after the start/);
  assert.match(seasonConflict(s('none', null), []), /start date/);
  // Editing a season compares against the others, not its old self.
  assert.equal(seasonConflict({ ...fall, startsAt: '2026-08-01T07:00:00Z' }, [fall, winter]), null);
});
