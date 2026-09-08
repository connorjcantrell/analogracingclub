// Link-preview images. Crawlers want a 1200×630 picture at an absolute URL, so
// the newest featured photo (or the logo) is resized on demand into that box
// and cached beside the uploads. The preview URL encodes the source file, so
// it changes when the featured photo does — which also busts Discord's cache.
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve, extname, basename } from 'node:path';
import sharp from 'sharp';
import { IMAGES_DIR, IMAGES_URL } from './images.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const OG_DIR = join(IMAGES_DIR, 'og');
const SAFE = /^[a-zA-Z0-9_-]+$/;
const LOGO = resolve('static/assets/logo.png');

// /assets/rounds/<folder>/<file>.<ext>  →  <folder>--<file>.jpg ; the logo → default.jpg
export function ogNameFor(sourceUrl) {
  if (!sourceUrl) return 'default.jpg';
  const m = new RegExp(`^${IMAGES_URL}/([^/]+)/([^/]+)\\.[a-z0-9]+$`, 'i').exec(sourceUrl);
  if (!m || !SAFE.test(m[1]) || !SAFE.test(m[2])) return 'default.jpg';
  return `${m[1]}--${m[2]}.jpg`;
}

// The uploaded file a preview name came from (null for the logo or garbage).
function sourceFor(name) {
  if (name === 'default.jpg') return null;
  const m = /^([a-zA-Z0-9_-]+)--([a-zA-Z0-9_-]+)\.jpg$/.exec(name);
  return m ? { folder: m[1], file: m[2] } : undefined;
}

async function findUpload(folder, file) {
  const dir = resolve(join(IMAGES_DIR, folder));
  if (!dir.startsWith(IMAGES_DIR + '/')) return null;
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const p = join(dir, `${file}.${ext}`);
    try { if ((await stat(p)).isFile()) return p; } catch { /* next */ }
  }
  return null;
}

// The rendered preview's path on disk, generating it on first use. Returns
// null when the name is malformed or its source photo no longer exists.
export async function ogImagePath(name) {
  const src = sourceFor(name);
  if (src === undefined) return null;
  const out = join(OG_DIR, name);
  try { if ((await stat(out)).isFile()) return out; } catch { /* render it */ }
  await mkdir(OG_DIR, { recursive: true });
  if (src === null) {
    // The logo on the site's dark ground, letterboxed rather than cropped.
    await sharp({ create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: '#121212' } })
      .composite([{ input: await sharp(LOGO).resize({ width: 720, height: 360, fit: 'inside' }).toBuffer(), gravity: 'centre' }])
      .jpeg({ quality: 88 }).toFile(out);
    return out;
  }
  const file = await findUpload(src.folder, src.file);
  if (!file) return null;
  // A race photo: cover the box, cropping toward the centre.
  await sharp(file).rotate().resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' }).jpeg({ quality: 84 }).toFile(out);
  return out;
}
