import { json } from '@sveltejs/kit';
import { adminMeta } from '$lib/server/admin/ops.js';

export async function GET() {
  return json(adminMeta());
}
