import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { removeSubsessions } from '$lib/server/admin/ops.js';

// DELETE — remove a stored result and its photos.
export async function DELETE({ locals, params }) {
  const { subsessions } = collections(locals.db);
  const { id } = params;
  if (!(await subsessions.countDocuments({ _id: id }))) return json({ error: 'subsession not found' }, { status: 404 });
  const removed = await removeSubsessions(locals.db, { _id: id });
  return json({ ok: true, deleted: id, ...removed });
}
