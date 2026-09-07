import { json } from '@sveltejs/kit';
import { listSpecialEvents } from '$lib/server/api/queries.js';

// Standalone special events, grouped as one "Special events" collection.
export async function GET({ locals }) {
  return json(await listSpecialEvents(locals.db));
}
