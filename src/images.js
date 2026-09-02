import crypto from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Uploaded race photos live under public/, so the normal static handler serves
// them; the DB stores only the public path.
export const IMAGES_DIR = join(__dirname, '..', 'public', 'assets', 'rounds');
export const IMAGES_URL = '/assets/rounds';

export const MAX_IMAGE_BYTES = 8_000_000; // 8 MB per file

// Sniff the real type from magic bytes — never trust the declared content-type.
const SIGNATURES = [
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['gif', (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8')],
  ['webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
];

/** Detected extension for an image buffer, or null when unrecognized. */
export function imageKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  return SIGNATURES.find(([, test]) => test(buf))?.[0] ?? null;
}

// Round-scoped folder; the id is content-addressed so re-uploading the same
// file is idempotent rather than piling up duplicates.
const folderFor = (subsessionId) => String(subsessionId).replace(/[^a-zA-Z0-9_-]+/g, '-');

/**
 * Store one image for a subsession. Returns { url, name, bytes } or throws
 * when the bytes are not a recognized image.
 */
export async function saveImage(subsessionId, buf, originalName = null) {
  const kind = imageKind(buf);
  if (!kind) throw new Error('not a recognized image (jpg, png, gif, webp)');
  if (buf.length > MAX_IMAGE_BYTES) {
    const mb = (n) => `${(n / 1_000_000).toFixed(1)} MB`;
    throw new Error(`too large (${mb(buf.length)}; limit ${mb(MAX_IMAGE_BYTES)})`);
  }
  const folder = folderFor(subsessionId);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const file = `${hash}.${kind}`;
  await mkdir(join(IMAGES_DIR, folder), { recursive: true });
  await writeFile(join(IMAGES_DIR, folder, file), buf);
  return {
    url: `${IMAGES_URL}/${folder}/${file}`,
    name: originalName || file,
    bytes: buf.length,
  };
}

/** Delete a stored image by its public URL. Ignores anything outside the store. */
export async function deleteImage(url) {
  if (typeof url !== 'string' || !url.startsWith(`${IMAGES_URL}/`)) return false;
  const rel = url.slice(IMAGES_URL.length + 1);
  const target = join(IMAGES_DIR, rel);
  if (!target.startsWith(IMAGES_DIR)) return false;
  try { await unlink(target); return true; } catch { return false; }
}
