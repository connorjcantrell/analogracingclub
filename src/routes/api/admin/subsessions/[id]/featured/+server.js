import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';

// PUT { url } — mark one photo as the round's hero shot (or clear it with a
// null url).
export async function PUT({ locals, params, request }) {
  const { subsessions } = collections(locals.db);
  const { id } = params;
  const doc = await subsessions.findOne({ _id: id }, { projection: { images: 1 } });
  if (!doc) return json({ error: 'subsession not found' }, { status: 404 });
  let body = {};
  try { body = await request.json(); } catch { /* empty body clears it */ }
  const target = body?.url ?? null;
  if (target && !(doc.images ?? []).some((x) => x.url === target)) {
    return json({ error: 'that photo is not attached to this round' }, { status: 400 });
  }
  await subsessions.updateOne({ _id: id }, { $set: { featuredImage: target } });
  return json({ ok: true, featuredImage: target });
}
