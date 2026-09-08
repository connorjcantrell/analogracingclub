import { listSubsessions } from '$lib/server/api/queries.js';
import { adminMeta, listAdminSeries } from '$lib/server/admin/ops.js';

// The gate ran in hooks.server.js; this just gathers what the page shows. The
// page mutates through /api/admin/* and calls invalidateAll() to re-run this.
export async function load({ locals }) {
  const [series, subsessions] = await Promise.all([listAdminSeries(locals.db), listSubsessions(locals.db)]);
  return { meta: adminMeta(), series, subsessions };
}
