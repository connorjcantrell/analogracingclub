import { json } from '@sveltejs/kit';
import { listSpecialEvents } from '$lib/server/api/queries.js';

// Standalone single sessions, grouped as one "Single Sessions" collection.
export async function GET({ locals }) {
  return json(await listSpecialEvents(locals.db));
}
