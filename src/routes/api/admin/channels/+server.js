import { json } from '@sveltejs/kit';
import { listChannels, addChannel } from '$lib/server/videos/index.js';
import { readJson } from '$lib/server/admin/ops.js';

export async function GET({ locals }) {
  return json(await listChannels(locals.db));
}

// POST { channel } — a channel URL, @handle or id. Resolves it, stores it and
// reads its feed straight away.
export async function POST({ locals, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const res = await addChannel(locals.db, body?.channel);
  if (res.error) return json({ error: res.error }, { status: 400 });
  return json({ ok: true, id: res.channel._id, name: res.channel.name, added: res.added ?? 0 });
}
