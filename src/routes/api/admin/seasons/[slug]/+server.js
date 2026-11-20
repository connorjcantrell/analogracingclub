import { json } from '@sveltejs/kit';
import { updateSeason, deleteSeason, seasonDate } from '$lib/server/season.js';
import { readJson } from '$lib/server/admin/ops.js';

// PATCH { name?, startsAt?, endsAt? } — rename or move a season. An empty
// endsAt clears the end (the season then runs until the next one starts).
export async function PATCH({ locals, params, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const patch = {};
  if (body?.name !== undefined) patch.name = body.name;
  if (body?.startsAt !== undefined) {
    const d = seasonDate(body.startsAt);
    if (!d) return json({ error: 'startsAt must be YYYY-MM-DD' }, { status: 400 });
    patch.startsAt = d;
  }
  if (body?.endsAt !== undefined) {
    const d = seasonDate(body.endsAt);
    if (d === undefined) return json({ error: 'endsAt must be YYYY-MM-DD or empty' }, { status: 400 });
    patch.endsAt = d;
  }
  try {
    const updated = await updateSeason(locals.db, params.slug, patch);
    return json({ ok: true, slug: params.slug, updated: Object.keys(updated) });
  } catch (e) {
    return json({ error: e.message }, { status: 400 });
  }
}

// DELETE — remove a season. Its series stay (no longer assigned to a season)
// and its sessions re-file into whatever season now holds their date.
export async function DELETE({ locals, params }) {
  try {
    await deleteSeason(locals.db, params.slug);
    return json({ ok: true, deleted: params.slug });
  } catch (e) {
    return json({ error: e.message }, { status: 404 });
  }
}
