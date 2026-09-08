import { json } from '@sveltejs/kit';
import { deletePost, updatePost } from '$lib/server/posts.js';
import { readJson } from '$lib/server/admin/ops.js';

// PATCH /api/admin/posts/:id { title?, intro?, rounds?, photos? } — edit a
// schedule post in place.
export async function PATCH({ locals, params, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const res = await updatePost(locals.db, params.id, body);
  if (res.error) return json({ error: res.error }, { status: res.error === 'post not found' ? 404 : 400 });
  return json({ ok: true, id: params.id });
}

// DELETE /api/admin/posts/:id — remove an authored post.
export async function DELETE({ locals, params }) {
  const res = await deletePost(locals.db, params.id);
  if (!res.ok) return json({ error: 'post not found' }, { status: 404 });
  return json({ ok: true, deleted: params.id });
}
