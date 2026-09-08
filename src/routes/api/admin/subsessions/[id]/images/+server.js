import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { saveImage, deleteImage } from '$lib/server/images.js';

// POST — multipart upload of race photos (field `images`). Appends to the
// subsession's `images` array; re-uploading a file is a no-op because the
// stored name is content-addressed.
export async function POST({ locals, params, request }) {
  const { subsessions } = collections(locals.db);
  const { id } = params;
  const doc = await subsessions.findOne({ _id: id }, { projection: { images: 1 } });
  if (!doc) return json({ error: 'subsession not found' }, { status: 404 });
  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'expected multipart/form-data' }, { status: 400 }); }
  const files = form.getAll('images').filter((f) => typeof f === 'object' && f.name && f.size > 0);
  if (!files.length) return json({ error: 'no image files in upload' }, { status: 400 });

  const added = [];
  const failed = [];
  for (const f of files) {
    try { added.push(await saveImage(id, Buffer.from(await f.arrayBuffer()), f.name)); }
    catch (e) { failed.push({ name: f.name, error: e.message }); }
  }
  if (added.length) {
    const merged = [...(doc.images ?? [])];
    for (const img of added) if (!merged.some((x) => x.url === img.url)) merged.push(img);
    await subsessions.updateOne({ _id: id }, { $set: { images: merged } });
  }
  return json({ ok: added.length > 0, added, failed }, { status: added.length ? 200 : 400 });
}

// DELETE ?url= — drop one photo.
export async function DELETE({ locals, params, url }) {
  const { subsessions } = collections(locals.db);
  const { id } = params;
  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'url required' }, { status: 400 });
  const upd = await subsessions.updateOne({ _id: id }, { $pull: { images: { url: target } } });
  if (!upd.matchedCount) return json({ error: 'subsession not found' }, { status: 404 });
  // Never leave the hero pointing at a photo that no longer exists.
  await subsessions.updateOne({ _id: id, featuredImage: target }, { $set: { featuredImage: null } });
  await deleteImage(target);
  return json({ ok: true, removed: target });
}
