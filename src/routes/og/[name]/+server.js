import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { ogImagePath } from '$lib/server/og.js';

// GET /og/<name>.jpg — a 1200×630 link-preview rendering, made on first request
// and cached on disk (see src/lib/server/og.js).
export async function GET({ params }) {
  const path = await ogImagePath(params.name);
  if (!path) error(404, 'Not found');
  const info = await stat(path);
  return new Response(Readable.toWeb(createReadStream(path)), {
    headers: { 'content-type': 'image/jpeg', 'content-length': String(info.size), 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
