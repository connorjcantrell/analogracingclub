import { json } from '@sveltejs/kit';
import { computeMatchup } from '$lib/server/power/index.js';

// The race-by-race head-to-head between two drivers.
export async function GET({ locals, url }) {
  const a = Number(url.searchParams.get('a'));
  const b = Number(url.searchParams.get('b'));
  if (!Number.isInteger(a) || !Number.isInteger(b)) return json({ error: 'a and b (cust ids) required' }, { status: 400 });
  return json(await computeMatchup(locals.db, a, b));
}
