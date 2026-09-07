import { json } from '@sveltejs/kit';
import { getSubsession } from '$lib/server/api/queries.js';

export async function GET({ locals, params }) {
  const sub = await getSubsession(locals.db, params.id);
  return sub ? json(sub) : json({ error: 'subsession not found' }, { status: 404 });
}
