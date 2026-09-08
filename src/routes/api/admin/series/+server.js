import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { FORMATS, pointsConfigFor } from '$lib/server/scoring/formats.js';
import { SLUG_RE } from '$lib/server/series.js';
import { EVENT_TYPES, isEventType, isContainerType, resolveEventType } from '$lib/server/event-types.js';
import { readJson, listAdminSeries } from '$lib/server/admin/ops.js';

export async function GET({ locals }) {
  return json(await listAdminSeries(locals.db));
}

// POST { slug, name, eventType, rounds?, format?, dropCount? } — create a series.
export async function POST({ locals, request }) {
  const { series } = collections(locals.db);
  const { body, error } = await readJson(request);
  if (error) return json({ error }, { status: 400 });
  const slug = String(body?.slug ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const eventType = body?.eventType;
  if (!SLUG_RE.test(slug) || !name) return json({ error: 'slug (kebab-case) and name required' }, { status: 400 });
  if (!isEventType(eventType)) return json({ error: `eventType must be one of ${Object.keys(EVENT_TYPES).join(', ')}` }, { status: 400 });
  // A series is a container; a one-off-only type (a hosted session) can't be one.
  if (!isContainerType(eventType)) return json({ error: `${EVENT_TYPES[eventType].name} is a one-off event, not a series` }, { status: 400 });
  // Default the points format to whatever the event type expects.
  const format = body?.format ?? resolveEventType(eventType).defaultFormat;
  if (!FORMATS[format]) return json({ error: 'unknown format' }, { status: 400 });
  // How many of each driver's lowest rounds the championship discards.
  const dropCount = body?.dropCount == null ? 0 : body.dropCount;
  if (!Number.isInteger(dropCount) || dropCount < 0) return json({ error: 'dropCount must be an integer >= 0' }, { status: 400 });
  if (await series.findOne({ slug })) return json({ error: 'slug already exists' }, { status: 409 });
  const rounds = Number.isInteger(body?.rounds) && body.rounds > 0 ? body.rounds : 3;
  await series.insertOne({
    slug, name, eventType, status: 'upcoming', dropCount,
    schedule: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, track: null, date: null })),
    format, pointsConfig: pointsConfigFor(format),
    createdAt: new Date(),
  });
  return json({ ok: true, slug, created: true });
}
