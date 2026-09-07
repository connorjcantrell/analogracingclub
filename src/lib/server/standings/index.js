import { collections } from '../db/index.js';

// How a driver's counted total is derived from their per-round points. By
// default every round counts; a series with a `dropCount` discards each
// driver's lowest N rounds first (a "drop your worst rounds" championship).
// Dropping never leaves a driver with nothing: it only applies once they have
// run more rounds than the drop count. `eventType` is passed through as the
// hook for any future per-type rule.
export function standingsRuleFor({ dropCount = 0 } = {}) {
  return {
    // entries: [ [roundKey, points], ... ]. Returns { total, dropped } where
    // dropped is the round keys that did not count.
    apply(entries) {
      const dropped = dropCount > 0 && entries.length > dropCount
        ? [...entries].sort((a, b) => a[1] - b[1]).slice(0, dropCount).map(([k]) => k)
        : [];
      const drop = new Set(dropped);
      const total = entries.reduce((sum, [k, pts]) => sum + (drop.has(k) ? 0 : pts), 0);
      return { total, dropped };
    },
  };
}

// Series standings: fold every stored result into per-driver totals with a
// per-round breakdown. Sorted by total, then feature wins, sprint wins, poles.
export async function computeStandings(db, { seriesSlug }) {
  const { subsessions, series } = collections(db);
  const s = await series.findOne({ slug: seriesSlug });
  const docs = await subsessions.find({ seriesSlug }, { projection: { raw: 0 } }).toArray();
  // Per-round points multipliers (a double-points finale scores 2×).
  const multipliers = Object.fromEntries((s?.schedule ?? []).map((r) => [r.round, r.multiplier ?? 1]));
  const out = foldStandings(docs, { eventType: s?.eventType, multipliers, dropCount: s?.dropCount ?? 0 });
  // Show every scheduled round (even ones not yet run), plus any extra rounds seen.
  const scheduled = (s?.schedule ?? []).map((r) => r.round);
  out.rounds = [...new Set([...scheduled, ...out.rounds])].sort((a, b) => a - b);
  return out;
}

export function foldStandings(docs, { eventType, multipliers = {}, dropCount = 0 } = {}) {
  const rule = standingsRuleFor({ eventType, dropCount });
  const byDriver = new Map();
  const rounds = new Set();
  for (const d of docs) {
    const round = d.round ?? d._id;
    rounds.add(round);
    const mult = multipliers[round] ?? 1;
    for (const s of d.simsessions ?? []) {
      for (const r of s.results ?? []) {
        let row = byDriver.get(r.custId);
        if (!row) {
          row = {
            custId: r.custId, displayName: r.displayName, rounds: {},
            total: 0, qualifying: 0, sprint: 0, feature: 0,
            poles: 0, sprintWins: 0, featureWins: 0, lapsLed: 0, starts: 0,
          };
          byDriver.set(r.custId, row);
        }
        row.displayName = r.displayName;
        const pts = r.points?.total ?? 0;
        // The round total (and thus the championship total) carries the round's
        // multiplier; the tiebreak buckets below stay in raw points.
        row.rounds[round] = (row.rounds[round] ?? 0) + pts * mult;
        if (s.kind === 'qualifying') { row.qualifying += pts; if (r.finish === 1) row.poles += 1; }
        if (s.kind === 'sprint') { row.sprint += pts; if (r.finish === 1) row.sprintWins += 1; row.lapsLed += r.lapsLead ?? 0; }
        if (s.kind === 'feature') { row.feature += pts; if (r.finish === 1) row.featureWins += 1; row.lapsLed += r.lapsLead ?? 0; row.starts += 1; }
      }
    }
  }
  // The counted total is the rule over each driver's per-round points. A round
  // that RAN but the driver missed counts as a droppable zero, so drops land on
  // absences before participated rounds. A drop series also records which rounds
  // were discarded, so the page can show it.
  const runRounds = [...rounds];
  for (const row of byDriver.values()) {
    const entries = runRounds.map((round) => [round, row.rounds[round] ?? 0]);
    const { total, dropped } = rule.apply(entries);
    row.total = total;
    row.dropped = dropped;
  }
  const standings = [...byDriver.values()].sort((a, b) =>
    b.total - a.total || b.featureWins - a.featureWins || b.sprintWins - a.sprintWins ||
    b.poles - a.poles || a.displayName.localeCompare(b.displayName));
  return { rounds: [...rounds].sort((a, b) => a - b), standings };
}
