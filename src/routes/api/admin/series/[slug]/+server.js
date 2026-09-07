import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { removeSubsessions } from '$lib/server/admin/ops.js';

// DELETE /api/admin/series/:slug?confirm=<slug> — remove the series AND every
// result filed under it, photos included. The confirm param must echo the
// slug: without it the call is a dry run that reports what would go (409 +
// counts), which the admin page uses to build its confirmation prompt.
export async function DELETE({ locals, params, url }) {
  const { series, subsessions } = collections(locals.db);
  const { slug } = params;
  const found = await series.findOne({ slug }, { projection: { _id: 0, slug: 1, name: 1 } });
  if (!found) return json({ error: 'series not found' }, { status: 404 });
  const results = await subsessions.countDocuments({ seriesSlug: slug });
  if (url.searchParams.get('confirm') !== slug) {
    return json({ error: `confirmation required: pass ?confirm=${slug}`, slug, name: found.name, results }, { status: 409 });
  }
  const removed = await removeSubsessions(locals.db, { seriesSlug: slug });
  await series.deleteOne({ slug });
  return json({ ok: true, deleted: slug, ...removed });
}
