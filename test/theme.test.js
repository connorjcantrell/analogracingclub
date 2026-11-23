import test from 'node:test';
import assert from 'node:assert/strict';
import { clockTheme, nextFlip } from '../src/lib/theme.js';

const at = (h, m = 0) => new Date(2026, 10, 20, h, m);

test('light through the day, dark through the night', () => {
  assert.equal(clockTheme(at(6, 59)), 'dark');
  assert.equal(clockTheme(at(7)), 'light');
  assert.equal(clockTheme(at(18, 59)), 'light');
  assert.equal(clockTheme(at(19)), 'dark');
  assert.equal(clockTheme(at(0)), 'dark');
});

test('the next flip is the coming 07:00 or 19:00', () => {
  assert.equal(nextFlip(at(3)), at(7).getTime());
  assert.equal(nextFlip(at(7)), at(19).getTime());
  assert.equal(nextFlip(at(12, 30)), at(19).getTime());
  assert.equal(nextFlip(at(23)), new Date(2026, 10, 21, 7).getTime());
});
