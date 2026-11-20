import { json } from '@sveltejs/kit';
import { listSeasons, createSeason, seasonDate, publicSeason } from '$lib/server/season.js';
import { readJson } from '$lib/server/admin/ops.js';

export async function GET({ locals }) {
  return json((await listSeasons(locals.db)).map(publicSeason));
}

// POST { name, startsAt: "YYYY-MM-DD", endsAt?: "YYYY-MM-DD" } — create a
// season. Dates are league-calendar days (Pacific). Every stored session is
// then re-filed into the season its start time falls in.
export async function POST({ locals, request }) {
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const startsAt = seasonDate(body?.startsAt), endsAt = seasonDate(body?.endsAt);
  if (startsAt === undefined || endsAt === undefined) return json({ error: 'dates must be YYYY-MM-DD' }, { status: 400 });
  if (!startsAt) return json({ error: 'startsAt required' }, { status: 400 });
  try {
    const slug = await createSeason(locals.db, { name: body?.name, startsAt, endsAt });
    return json({ ok: true, slug, created: true });
  } catch (e) {
    return json({ error: e.message }, { status: 400 });
  }
}
