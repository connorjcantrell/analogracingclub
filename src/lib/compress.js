// Client-side downscaling for photo uploads, shared by the admin panels.
// Race photos come off phones and cameras at 10-25 MB, well past what the
// server accepts and far more than the gallery needs. Downscale to fit a
// 2560px box and re-encode as JPEG until it lands under the cap. Files that
// are already small pass through untouched.
const UPLOAD_LIMIT = 7_500_000; // keep clear of the server's 8 MB cap
const MAX_EDGE = 2560;
export async function compress(f) {
  if (!f.type.startsWith('image/') || f.type === 'image/gif') return f;
  if (f.size <= UPLOAD_LIMIT) return f;
  let bitmap;
  try { bitmap = await createImageBitmap(f); }
  catch { return f; } // unreadable here — let the server decide
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const name = f.name.replace(/\.[^.]+$/, '') + '.jpg';
  for (const q of [0.85, 0.72, 0.6, 0.45]) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob && blob.size <= UPLOAD_LIMIT) return new File([blob], name, { type: 'image/jpeg' });
  }
  return f; // still too big — surface the server's error rather than guess
}

