import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleBudget, cleanAllocation, tallyBallots, winners } from '../src/lib/server/vote/index.js';

const session = { cars: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] };

test('a voting budget is a tenth of the season points, rounded up', () => {
  assert.equal(scaleBudget(43), 5);
  assert.equal(scaleBudget(50), 5);
  assert.equal(scaleBudget(51), 6);
  assert.equal(scaleBudget(1), 1, 'a single point still buys one vote');
  assert.equal(scaleBudget(0), 0);
  assert.equal(scaleBudget(undefined), 0, 'a driver with no results has nothing to spend');
});

test('a ballot may vote for or against a car, and every vote costs one', () => {
  const { clean, spent } = cleanAllocation(session, { a: '3', b: '-2', c: '0' });
  assert.deepEqual(clean, { a: 3, b: -2 }, 'zeros are dropped, signs are kept');
  assert.equal(spent, 5, 'three for A plus two against B spends five');
});

test('a ballot rejects fractions and cars that are not on it', () => {
  assert.throws(() => cleanAllocation(session, { a: '1.5' }), /whole numbers/);
  assert.throws(() => cleanAllocation(session, { zz: '1' }), /Unknown car/);
});

test('the tally nets votes against off votes for and keeps both halves', () => {
  const { totals, up, down, upBy, downBy, voters } = tallyBallots([
    { spent: 4, allocation: { a: 3, b: -1 } },
    { spent: 3, allocation: { a: -2, c: 1 } },
    { spent: 2, allocation: { c: 2 } },
    { spent: 0, allocation: {} },
  ]);
  assert.deepEqual(totals, { a: 1, b: -1, c: 3 });
  assert.deepEqual(up, { a: 3, c: 3 });
  assert.deepEqual(down, { a: 2, b: 1 });
  assert.deepEqual(upBy, { a: 1, c: 2 }, 'drivers for each car, however many votes they spent');
  assert.deepEqual(downBy, { a: 1, b: 1 });
  assert.equal(voters, 3, 'an empty ballot is not a voter');
});

test('the highest net score wins, and ties share it', () => {
  const names = (t) => winners(session, t).map((c) => c.name);
  assert.deepEqual(names({}), [], 'nothing cast, no winner');
  assert.deepEqual(names({ a: 2, b: 2, c: -1 }), ['A', 'B']);
  assert.deepEqual(names({ a: -3 }), ['B', 'C'], 'an untouched car outranks one only voted against');
});
