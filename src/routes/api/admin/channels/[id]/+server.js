import { json } from '@sveltejs/kit';
import { removeChannel } from '$lib/server/videos/index.js';

// DELETE /api/admin/channels/:id — stop following a channel; its videos go too.
export async function DELETE({ locals, params }) {
  const res = await removeChannel(locals.db, params.id);
  if (res.error) return json({ error: res.error }, { status: 404 });
  return json({ ok: true, deleted: params.id, videos: res.videos });
}
