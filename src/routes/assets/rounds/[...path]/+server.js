import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { IMAGES_DIR } from '$lib/server/images.js';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

// Admin-uploaded photos are written at runtime, so they can't be part of the
// build's static assets; stream them from the images directory instead.
export async function GET({ params }) {
  const target = resolve(join(IMAGES_DIR, params.path));
  if (!target.startsWith(IMAGES_DIR + '/')) error(403, 'Forbidden');
  let info;
  try { info = await stat(target); } catch { error(404, 'Not found'); }
  if (!info.isFile()) error(404, 'Not found');
  return new Response(Readable.toWeb(createReadStream(target)), {
    headers: {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(info.size),
      // Files are content-addressed, so a URL never changes meaning.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
