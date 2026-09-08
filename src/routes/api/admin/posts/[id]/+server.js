import { json } from '@sveltejs/kit';
import { deletePost } from '$lib/server/posts.js';

// DELETE /api/admin/posts/:id — remove an authored post.
export async function DELETE({ locals, params }) {
  const res = await deletePost(locals.db, params.id);
  if (!res.ok) return json({ error: 'post not found' }, { status: 404 });
  return json({ ok: true, deleted: params.id });
}
