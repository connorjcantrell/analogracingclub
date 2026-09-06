import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photosFrom } from '../src/api/queries.js';

test('photosFrom flattens images with event context and marks the featured one', () => {
  const rows = [
    {
      _id: 's2', track: { name: 'Sebring', config: 'Club' }, startTime: 200,
      seriesSlug: 's2', round: 2, featuredImage: '/assets/rounds/s2/b.jpg',
      images: [{ url: '/assets/rounds/s2/a.jpg' }, { url: '/assets/rounds/s2/b.jpg' }],
    },
    {
      _id: 's1', track: { name: 'Lime Rock', config: null }, startTime: 100,
      seriesSlug: null, round: null,
      images: [{ url: '/assets/rounds/s1/c.jpg' }],
    },
  ];
  const photos = photosFrom(rows);
  // Input order is preserved (the caller sorts newest-first).
  assert.deepEqual(photos.map((p) => p.url),
    ['/assets/rounds/s2/a.jpg', '/assets/rounds/s2/b.jpg', '/assets/rounds/s1/c.jpg']);
  assert.equal(photos[0].track, 'Sebring');
  assert.equal(photos[0].config, 'Club');
  assert.equal(photos[0].featured, false);
  assert.equal(photos[1].featured, true);
  assert.equal(photos[2].track, 'Lime Rock');
  assert.equal(photos[2].round, null);
});

test('photosFrom honors the limit and tolerates docs with no images', () => {
  const rows = [
    { images: [{ url: 'a' }, { url: 'b' }, { url: 'c' }] },
    {},
    { images: [{ url: 'd' }] },
  ];
  assert.deepEqual(photosFrom(rows, { limit: 2 }).map((p) => p.url), ['a', 'b']);
  assert.equal(photosFrom(rows).length, 4);
  assert.deepEqual(photosFrom(rows, { limit: 0 }), []);
});
