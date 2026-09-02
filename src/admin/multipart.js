// Minimal multipart/form-data parser for image uploads. Buffers the whole
// body (capped by the caller), which is fine for the handful of race photos
// an admin uploads at once; anything larger belongs in a streaming parser.

const DASH = 0x2d;

/** Read the raw request body up to `max` bytes, as a Buffer. */
export function readBuffer(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Boundary token from a Content-Type header, or null when not multipart. */
export function boundaryOf(contentType = '') {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  return (m[1] ?? m[2]).trim();
}

// Split on the boundary delimiter, yielding the bytes of each part.
function* segments(body, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  let start = body.indexOf(delim);
  if (start === -1) return;
  start += delim.length;
  while (start < body.length) {
    // A closing delimiter is "--boundary--".
    if (body[start] === DASH && body[start + 1] === DASH) return;
    // Skip the CRLF that follows the delimiter.
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
    const next = body.indexOf(delim, start);
    if (next === -1) return;
    // Trim the CRLF that precedes the next delimiter.
    yield body.subarray(start, Math.max(start, next - 2));
    start = next + delim.length;
  }
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of raw.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

/**
 * Parse a multipart body into parts:
 *   { name, filename, contentType, data }  — `data` is a Buffer.
 * Fields without a filename carry their value as UTF-8 in `data`.
 */
export function parseMultipart(body, boundary) {
  const parts = [];
  for (const seg of segments(body, boundary)) {
    const split = seg.indexOf('\r\n\r\n');
    if (split === -1) continue;
    const headers = parseHeaders(seg.subarray(0, split).toString('utf8'));
    const disp = headers['content-disposition'] ?? '';
    const name = /name="([^"]*)"/i.exec(disp)?.[1];
    if (!name) continue;
    // RFC 2183 filenames may be quoted; take the basename only.
    const filename = /filename="([^"]*)"/i.exec(disp)?.[1];
    parts.push({
      name,
      filename: filename ? filename.split(/[\\/]/).pop() : null,
      contentType: headers['content-type'] ?? null,
      data: seg.subarray(split + 4),
    });
  }
  return parts;
}
