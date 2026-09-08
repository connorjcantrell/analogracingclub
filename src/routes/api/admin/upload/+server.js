import { json } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { ingestEventResult } from '$lib/server/import/ingest.js';
import { isEventType, isContainerType } from '$lib/server/event-types.js';
import { UPLOAD_MAX_BYTES } from '$lib/server/config.js';

// POST — body: iRacing event-result JSON.
//   ?series=&round=                file it as a round of an existing series, or
//   ?special=1&eventType=&title=   file it as a standalone special event
//                                  (no series, unscored, its own event type).
export async function POST({ locals, request, url }) {
  const q = url.searchParams;
  let ingestOpts;
  if (q.get('special') === '1') {
    const eventType = q.get('eventType');
    if (!isEventType(eventType) || isContainerType(eventType)) {
      return json({ error: 'special events need a one-off (non-series) event type' }, { status: 400 });
    }
    ingestOpts = { eventType, title: (q.get('title') ?? '').trim() || null };
  } else {
    const slug = q.get('series') || null;
    const round = q.get('round') ? Number(q.get('round')) : null;
    if (!slug) return json({ error: 'series (or special=1) required' }, { status: 400 });
    if (!Number.isInteger(round) || round < 1) return json({ error: 'round (integer >= 1) required' }, { status: 400 });
    ingestOpts = { seriesSlug: slug, round };
  }

  let payload;
  try {
    const text = await request.text();
    if (text.length > UPLOAD_MAX_BYTES) throw new Error('payload too large');
    payload = JSON.parse(text);
  } catch (e) {
    return json({ error: `invalid upload: ${e.message}` }, { status: 400 });
  }
  try {
    const result = await ingestEventResult(locals.db, payload, ingestOpts);
    // A league round auto-populates its slot in the series schedule, growing
    // it if needed and filling in the track — so rounds appear without being
    // pre-created.
    if (ingestOpts.seriesSlug) {
      const { series } = collections(locals.db);
      const s = await series.findOne({ slug: ingestOpts.seriesSlug });
      if (s) {
        const schedule = s.schedule ?? [];
        while (schedule.length < ingestOpts.round) schedule.push({ round: schedule.length + 1, track: null, date: null, multiplier: 1 });
        const row = schedule[ingestOpts.round - 1];
        if (row && !row.track && result.track) row.track = result.track;
        await series.updateOne({ slug: ingestOpts.seriesSlug }, { $set: { schedule } });
      }
    }
    return json({ ok: true, series: ingestOpts.seriesSlug ?? null, ...result });
  } catch (e) {
    return json({ error: `ingest failed: ${e.message}` }, { status: 400 });
  }
}
