import { json } from '@sveltejs/kit';
import { getSubsessionRaw } from '$lib/server/api/queries.js';

// GET — the stored event JSON as the original `{ type, data }` envelope, as a
// downloadable attachment.
export async function GET({ locals, params }) {
  const envelope = await getSubsessionRaw(locals.db, params.id);
  if (!envelope) return json({ error: 'subsession not found' }, { status: 404 });
  const safe = params.id.replace(/[^a-zA-Z0-9_-]+/g, '-');
  return new Response(JSON.stringify(envelope), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="eventresult-${safe}.json"`,
    },
  });
}
