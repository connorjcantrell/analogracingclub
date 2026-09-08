import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { saveImage, deleteImagesFor } from '$lib/server/images.js';
import { roundImageKey } from '$lib/server/admin/round-image.js';

// The 2:1 image on a series' schedule round, shown on the homepage's Next
// round card. POST ?round=N (multipart, field `image`) sets it, replacing any
// previous file; DELETE ?round=N clears it. Both update the schedule row
// directly, so they don't depend on the schedule form being saved.
const roundOf = (url) => { const n = Number(url.searchParams.get('round')); return Number.isInteger(n) && n > 0 ? n : null; };

export async function POST({ locals, params, url, request }) {
  const { series } = collections(locals.db);
  const round = roundOf(url);
  if (!round) return json({ error: 'round (integer >= 1) required' }, { status: 400 });
  const s = await series.findOne({ slug: params.slug }, { projection: { schedule: 1 } });
  if (!s) return json({ error: 'series not found' }, { status: 404 });
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'expected multipart/form-data' }, { status: 400 }); }
  const f = form.get('image');
  if (!f || typeof f !== 'object' || !f.size) return json({ error: 'no image file in upload' }, { status: 400 });
  const key = roundImageKey(params.slug, round);
  await deleteImagesFor(key); // one image per round: the new one replaces the old
  let saved;
  try { saved = await saveImage(key, Buffer.from(await f.arrayBuffer()), f.name); }
  catch (e) { return json({ error: e.message }, { status: 400 }); }
  // Write the row (creating the round if the schedule is shorter).
  const schedule = s.schedule ?? [];
  while (schedule.length < round) schedule.push({ round: schedule.length + 1, track: null, date: null, multiplier: 1 });
  const row = schedule.find((r) => r.round === round) ?? schedule[round - 1];
  row.image = saved.url;
  await series.updateOne({ slug: params.slug }, { $set: { schedule } });
  return json({ ok: true, round, image: saved.url });
}

export async function DELETE({ locals, params, url }) {
  const { series } = collections(locals.db);
  const round = roundOf(url);
  if (!round) return json({ error: 'round (integer >= 1) required' }, { status: 400 });
  const s = await series.findOne({ slug: params.slug }, { projection: { schedule: 1 } });
  if (!s) return json({ error: 'series not found' }, { status: 404 });
  await deleteImagesFor(roundImageKey(params.slug, round));
  const schedule = (s.schedule ?? []).map((r) => (r.round === round ? { ...r, image: null } : r));
  await series.updateOne({ slug: params.slug }, { $set: { schedule } });
  return json({ ok: true, round, image: null });
}
