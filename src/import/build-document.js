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
// opts: { seriesSlug?, round?, pointsConfig, rawType? }
export function buildSubsessionDocument(eventResult, opts = {}) {
  const { seriesSlug = null, round = null, pointsConfig = {}, rawType = null } = opts;
  const track = eventResult.track ?? {};

  const keep = (r) => typeof r.cust_id === 'number' && r.ai !== true;

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
          reasonOut: r.reason_out ?? null,
          points: computePoints(pointsConfig, { kind, finish, lapsLead }),
        };
      })
      .sort((a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity));
    return {
      number: sr.simsession_number,
      type: sr.simsession_type ?? null,
      name: sr.simsession_name ?? null,
      kind,
      results,
    };
  });

  return {
    // Season-scoped identity: idempotent per (series, subsession).
    _id: seriesSlug ? `${seriesSlug}:${eventResult.subsession_id}` : String(eventResult.subsession_id),
    subsessionId: eventResult.subsession_id,
    seriesSlug,
    round,
    leagueName: eventResult.league_name ?? null,
    seriesName: eventResult.series_name ?? null,
    track: { id: track.track_id ?? null, name: track.track_name ?? null, config: track.config_name ?? null },
    startTime: eventResult.start_time ?? null,
    rawType,          // original envelope `type` (or null) — for faithful download
    raw: eventResult, // complete event JSON, stored verbatim (source of truth)
    simsessions,
  };
}
