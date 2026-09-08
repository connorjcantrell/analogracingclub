import crypto from 'node:crypto';
import { mkdir, writeFile, unlink, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Uploaded race photos are runtime state, kept outside the build output in
// public/assets/rounds under the working directory (the Compose volume mounts
// there; IMAGES_DIR overrides it). The route at /assets/rounds/* serves them;
// the DB stores only the public path.
export const IMAGES_DIR = resolve(process.env.IMAGES_DIR ?? join(process.cwd(), 'public', 'assets', 'rounds'));
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

/**
 * Remove every stored photo for a subsession (its whole round folder), for use
 * when the result itself is deleted. Returns the number of files removed.
 */
export async function deleteImagesFor(subsessionId) {
  const folder = join(IMAGES_DIR, folderFor(subsessionId));
  if (!folder.startsWith(IMAGES_DIR + '/')) return 0;
  let count = 0;
  try { count = (await readdir(folder)).length; } catch { return 0; }
  await rm(folder, { recursive: true, force: true });
  return count;
}
