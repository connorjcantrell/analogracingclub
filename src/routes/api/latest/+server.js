import { json } from '@sveltejs/kit';
import { latestEvent } from '$lib/server/views.js';

// The most recently run event, league round or special.
export async function GET({ locals }) {
  const latest = await latestEvent(locals.db);
  return latest ? json(latest) : json({ error: 'no events yet' }, { status: 404 });
}
