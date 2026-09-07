import { json } from '@sveltejs/kit';
import { listDrivers } from '$lib/server/api/queries.js';

export async function GET({ locals }) {
  return json(await listDrivers(locals.db));
}
