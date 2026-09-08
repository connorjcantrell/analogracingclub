import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { SERIES_STATUSES } from '$lib/server/series.js';
import { isContainerType } from '$lib/server/event-types.js';
import { cleanSchedule, readJson } from '$lib/server/admin/ops.js';

// POST { slug, name?, status?, eventType?, schedule?, dropCount? }
export async function POST({ locals, request }) {
  const { series, subsessions } = collections(locals.db);
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const { slug } = body ?? {};
  if (!slug) return json({ error: 'slug required' }, { status: 400 });
  const set = {};
  if (body.name != null) { const n = String(body.name).trim(); if (!n) return json({ error: 'name cannot be empty' }, { status: 400 }); set.name = n; }
  if (body.status != null) { if (!SERIES_STATUSES.includes(body.status)) return json({ error: `status must be one of ${SERIES_STATUSES.join(', ')}` }, { status: 400 }); set.status = body.status; }
  if (body.eventType != null) {
    if (!isContainerType(body.eventType)) return json({ error: 'eventType must be a series-capable event type' }, { status: 400 });
    set.eventType = body.eventType;
  }
  if (body.schedule != null) {
    if (!Array.isArray(body.schedule)) return json({ error: 'schedule must be an array' }, { status: 400 });
    try { set.schedule = cleanSchedule(body.schedule); }
    catch (e) { return json({ error: e.message }, { status: 400 }); }
  }
  if (body.dropCount != null) { if (!Number.isInteger(body.dropCount) || body.dropCount < 0) return json({ error: 'dropCount must be an integer >= 0' }, { status: 400 }); set.dropCount = body.dropCount; }
  if (!Object.keys(set).length) return json({ error: 'nothing to update' }, { status: 400 });
  const upd = await series.updateOne({ slug }, { $set: set });
  if (!upd.matchedCount) return json({ error: 'series not found' }, { status: 404 });
  // Rounds carry their container's type; keep them in step.
  if (set.eventType) await subsessions.updateMany({ seriesSlug: slug }, { $set: { eventType: set.eventType } });
  return json({ ok: true, slug, updated: Object.keys(set) });
}
