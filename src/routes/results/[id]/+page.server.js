import { error } from '@sveltejs/kit';
import { resultEvent } from '$lib/server/results.js';

export async function load({ locals, params }) {
  const event = await resultEvent(locals.db, params.id);
  if (!event) error(404, 'No such event.');
  return { event };
}
