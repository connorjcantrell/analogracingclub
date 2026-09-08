// Thin fetch helpers shared by every page.

// Read a response as JSON without blowing up on an error page. SvelteKit's CSRF
// guard, a 413, or a reverse-proxy 502 all reply with plain text; JSON.parse on
// that surfaces as a baffling "unexpected character at line 1 column 1" crash.
// Turn those into the { ok:false, error } shape the callers already handle.
export async function readJson(r) {
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: text.trim() || `HTTP ${r.status}`, status: r.status }; }
}

export const api = (path) => fetch(path).then(readJson);

// JSON request for the admin API. A 401 means the password session lapsed;
// bounce to the login form rather than showing a JSON error.
export const post = (path, body, method = 'POST') => fetch(path, {
  method,
  headers: { 'content-type': 'application/json' },
  body: body == null ? undefined : JSON.stringify(body),
}).then(async (r) => {
  if (r.status === 401) location.href = '/admin/login';
  return readJson(r);
});
