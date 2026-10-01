import { json } from '@sveltejs/kit';
import { setVideoHidden } from '$lib/server/videos/index.js';
import { readJson } from '$lib/server/admin/ops.js';

// PATCH /api/admin/videos/:id { hidden } — keep a false positive off the site.
export async function PATCH({ locals, params, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const res = await setVideoHidden(locals.db, params.id, body?.hidden);
  if (res.error) return json({ error: res.error }, { status: 404 });
  return json({ ok: true, id: params.id, hidden: !!body?.hidden });
}
