import { sessionKind, normalizePosition } from './mappers.js';
import { computePoints } from '../scoring/calculator.js';

// Pure: build the subsession document from an event-result, mapping session
// kinds, normalizing positions, and computing points from the series's
// pointsConfig. No DB access.
//
// AI drivers are dropped and every position (finish, start) is re-ranked among
// the remaining drivers, so results are scored as if the AI cars were never
// there. The complete event JSON is stored verbatim under `raw`, so a rescore
// only needs a rebuild from raw (see src/scoring/rescore.js).
//
// opts: { seriesSlug?, round?, eventType?, title?, pointsConfig, rawType? }
// A league round carries its container's eventType and a round; a standalone
// special event has seriesSlug null, its own eventType, and an optional title.
// iRacing reports "N/A" as the config for tracks with only one layout; store
// null so nothing downstream has to special-case it.
const trackConfig = (c) => (c && !/^n\/?a$/i.test(c.trim()) ? c : null);

export function buildSubsessionDocument(eventResult, opts = {}) {
  const { seriesSlug = null, round = null, eventType = null, title = null, pointsConfig = {}, rawType = null } = opts;
  const track = eventResult.track ?? {};

  // iRacing lists every registered entrant in every session, whether or not
  // they turned a wheel, and hands each of them a finish_position. A driver
  // who completed no laps did not take part, so drop them from THAT session —
  // per session, not per event, since someone can sit out qualifying and
  // still race. Keeping them would classify a no-show as a finisher, and
  // hand them a grid slot they never used.
  const keep = (r) => typeof r.cust_id === 'number' && r.ai !== true
    && (r.laps_complete ?? 0) > 0;

  // Re-rank a session's kept rows: original position order, compacted to 1..n.
  const rankBy = (rows, field) => {
    const ranked = rows
      .map((r) => [r, normalizePosition(r[field])])
      .filter(([, p]) => p != null)
      .sort((a, b) => a[1] - b[1]);
    return new Map(ranked.map(([r], i) => [r.cust_id, i + 1]));
  };

  const simsessions = (eventResult.session_results ?? []).map((sr) => {
    const kind = sessionKind(sr);
    const rows = (sr.results ?? []).filter(keep);
    const finishRank = rankBy(rows, 'finish_position');
    const startRank = rankBy(rows, 'starting_position');
    const results = rows
      .map((r) => {
        const finish = finishRank.get(r.cust_id) ?? null;
        const lapsLead = r.laps_lead ?? 0;
        return {
          custId: r.cust_id,
          displayName: r.display_name ?? `Driver ${r.cust_id}`,
          finish,
          start: startRank.get(r.cust_id) ?? null,
          incidents: r.incidents ?? 0,
          lapsComplete: r.laps_complete ?? null,
          lapsLead,
          bestLapTime: r.best_lap_time > 0 ? r.best_lap_time : null,
          // Mean lap over the session — sustained pace, where bestLapTime is
          // one hot lap. 0 means the driver completed no timed lap.
          averageLapTime: r.average_lap > 0 ? r.average_lap : null,
          // Gap to the session leader (10,000ths of a second): the pole time
          // in qualifying, the winner's time in a race. 0 for the leader.
          interval: r.interval >= 0 ? r.interval : null,
          reasonOut: r.reason_out ?? null,
          points: computePoints(pointsConfig, { kind, finish, lapsLead }),
        };
      })
      .sort((a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity));

    // Dropping AI can remove the original leader, so intervals are rebased on
    // the top remaining finisher — who is, by definition, now 0 behind.
    const lead = results.find((r) => r.finish === 1);
    if (lead?.interval) {
      const base = lead.interval;
      for (const r of results) if (r.interval != null) r.interval = Math.max(0, r.interval - base);
    }

    return {
      number: sr.simsession_number,
      type: sr.simsession_type ?? null,
      name: sr.simsession_name ?? null,
      kind,
      results,
    };
  });

  // The lap-led bonus is worth 1 point per ROUND, not per session: leading in
  // both the sprint and the feature still pays once. computePoints() only sees
  // one session, so it awards the bonus in each; strip the duplicates here,
  // keeping the earliest race the driver led.
  const paid = new Set();
  for (const sim of simsessions) {
    if (sim.kind === 'qualifying' || sim.kind === 'practice') continue;
    for (const r of sim.results) {
      if (!r.points.bonus) continue;
      if (paid.has(r.custId)) {
        r.points = { ...r.points, bonus: 0, total: r.points.base };
      } else {
        paid.add(r.custId);
      }
    }
  }

  // Distinct cars raced, in first-seen order. Multi-class events list each.
  const cars = [...new Set((eventResult.session_results ?? [])
    .flatMap((sr) => (sr.results ?? []).filter(keep))
    .map((r) => r.car_name)
    .filter(Boolean))];

  return {
    // Season-scoped identity: idempotent per (series, subsession).
    _id: seriesSlug ? `${seriesSlug}:${eventResult.subsession_id}` : String(eventResult.subsession_id),
    subsessionId: eventResult.subsession_id,
    seriesSlug,
    round,
    // What this event is (drives its layout), and, for a standalone special,
    // a human title (falls back to the track name).
    eventType,
    title: seriesSlug ? null : (title || track.track_name || null),
    leagueName: eventResult.league_name ?? null,
    seriesName: eventResult.series_name ?? null,
    track: { id: track.track_id ?? null, name: track.track_name ?? null, config: trackConfig(track.config_name) },
    cars,
    startTime: eventResult.start_time ?? null,
    rawType,          // original envelope `type` (or null) — for faithful download
    raw: eventResult, // complete event JSON, stored verbatim (source of truth)
    simsessions,
  };
}
