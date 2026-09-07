import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { IMAGES_DIR, deleteImagesFor } from '../src/lib/server/images.js';

const exists = (p) => access(p).then(() => true, () => false);

test('deleteImagesFor removes a round folder and reports the file count', async () => {
  const id = `test-cascade-${process.pid}`;
  const dir = join(IMAGES_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'a.jpg'), 'x');
  await writeFile(join(dir, 'b.png'), 'y');
  assert.equal(await deleteImagesFor(id), 2);
  assert.equal(await exists(dir), false);
});

test('deleteImagesFor is a no-op for a round with no photos and never escapes the store', async () => {
  assert.equal(await deleteImagesFor(`nothing-here-${process.pid}`), 0);
  assert.equal(await deleteImagesFor('../../..'), 0);
  assert.equal(await deleteImagesFor(''), 0);
});
