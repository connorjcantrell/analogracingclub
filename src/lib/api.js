// Thin fetch helpers shared by every page.
export const api = (path) => fetch(path).then((r) => r.json());

// JSON request for the admin API. A 401 means the password session lapsed;
// bounce to the login form rather than showing a JSON error.
export const post = (path, body, method = 'POST') => fetch(path, {
  method,
  headers: { 'content-type': 'application/json' },
  body: body == null ? undefined : JSON.stringify(body),
}).then(async (r) => {
  if (r.status === 401) location.href = '/admin/login';
  return r.json();
});
