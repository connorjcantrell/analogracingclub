import { json } from '@sveltejs/kit';
import { listPosts, createPost } from '$lib/server/posts.js';
import { readJson } from '$lib/server/admin/ops.js';

export async function GET({ locals }) {
  return json(await listPosts(locals.db));
}

// POST { seriesSlug, title?, intro?, rounds?, photos?, publishedAt? } — create a
// schedule post announcing an upcoming season.
export async function POST({ locals, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const res = await createPost(locals.db, body);
  if (res.error) return json({ error: res.error }, { status: 400 });
  return json({ ok: true, id: res.post._id });
}
