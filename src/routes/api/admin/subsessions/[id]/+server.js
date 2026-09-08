import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { removeSubsessions, readJson } from '$lib/server/admin/ops.js';
import { cleanResultPost } from '$lib/server/posts.js';

// DELETE — remove a stored result and its photos.
export async function DELETE({ locals, params }) {
  const { subsessions } = collections(locals.db);
  const { id } = params;
  if (!(await subsessions.countDocuments({ _id: id }))) return json({ error: 'subsession not found' }, { status: 404 });
  const removed = await removeSubsessions(locals.db, { _id: id });
  return json({ ok: true, deleted: id, ...removed });
}

// PATCH { postTitle?, postBody? } — the result's feed post: a headline that
// replaces the automatic one and a paragraph under it. Empty strings clear.
export async function PATCH({ locals, params, request }) {
  const { subsessions } = collections(locals.db);
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const fields = cleanResultPost(body);
  if (!Object.keys(fields).length) return json({ error: 'nothing to update' }, { status: 400 });
  const set = {}, unset = {};
  for (const [k, v] of Object.entries(fields)) (v ? set : unset)[k] = v || '';
  const update = { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
  const upd = await subsessions.updateOne({ _id: params.id }, update);
  if (!upd.matchedCount) return json({ error: 'subsession not found' }, { status: 404 });
  return json({ ok: true, id: params.id, ...fields });
}
