import { collections } from '../db/index.js';
import { foldStandings } from '../standings/index.js';

// Stake: a driver's share of every championship point the season has paid
// out, as a percentage. It is the club's steering weight — when a season
// closes, a driver's stake is what they spend in the vote on the cars and
// tracks that follow (see src/lib/server/vote) — so the page shows not just
// where it stands but how it moved, round by round.
//
// Points are the standings' own counted totals (round multipliers and any
// drop rule included), so the final round's stake is exactly each driver's
// slice of the standings table.

const pct = (part, whole) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);

/**
 * Fold stored subsessions into per-driver stake trajectories. Pure.
 * Returns:
 *   rounds   — the rounds that have run, in order: { round, pool } where pool
 *              is every counted point across the field after that round
 *   pool     — the final pool
 *   drivers  — sorted by current stake, then points: { custId, displayName,
 *              points, stake, change, path: [{ round, points, stake }] }.
 *              `path` starts at the driver's first round; `change` is the move
 *              in stake (percentage points) since the previous round, null
 *              for a driver's debut round.
 */
export function foldStake(docs, opts = {}) {
  const key = (d) => d.round ?? d._id;
  const runRounds = [...new Set(docs.map(key))].sort((a, b) => a - b);
  // Standings as of each round: refold on the rounds up to and including it.
  // Drop rules depend on how many rounds have run, so each point in the
  // trajectory is the table as it stood that night.
  const snapshots = runRounds.map((round, i) => {
    const upTo = new Set(runRounds.slice(0, i + 1));
    const { standings } = foldStandings(docs.filter((d) => upTo.has(key(d))), opts);
    const pool = standings.reduce((sum, r) => sum + r.total, 0);
    return { round, pool, standings };
  });

  const byDriver = new Map();
  for (const snap of snapshots) {
    for (const row of snap.standings) {
      let d = byDriver.get(row.custId);
      if (!d) {
        d = { custId: row.custId, displayName: row.displayName, points: 0, stake: 0, change: null, path: [] };
        byDriver.set(row.custId, d);
      }
      d.displayName = row.displayName;
      const stake = pct(row.total, snap.pool);
      const prev = d.path.at(-1);
      d.path.push({ round: snap.round, points: row.total, stake });
      d.points = row.total;
      d.stake = stake;
      d.change = prev ? Math.round((stake - prev.stake) * 10) / 10 : null;
    }
  }

  const drivers = [...byDriver.values()].sort((a, b) =>
    b.stake - a.stake || b.points - a.points || a.displayName.localeCompare(b.displayName));
  return {
    rounds: snapshots.map(({ round, pool }) => ({ round, pool })),
    pool: snapshots.at(-1)?.pool ?? 0,
    drivers,
  };
}

/**
 * Stake for a series, with its schedule alongside so the chart can lay out
 * the whole season (rounds still to come included) and name each round's
 * track. `schedule` is every round, scheduled or seen, in order.
 */
export async function computeStake(db, { seriesSlug }) {
  const { subsessions, series } = collections(db);
  const s = await series.findOne({ slug: seriesSlug });
  const docs = await subsessions.find({ seriesSlug }, { projection: { raw: 0 } }).toArray();
  const multipliers = Object.fromEntries((s?.schedule ?? []).map((r) => [r.round, r.multiplier ?? 1]));
  const out = foldStake(docs, {
    eventType: s?.eventType, multipliers, dropCount: s?.dropCount ?? 0,
    qualifyingPlaces: Object.keys(s?.pointsConfig?.qualifying?.base ?? {}).length,
  });
  const byRound = new Map((s?.schedule ?? []).map((r) => [r.round, { round: r.round, track: r.track ?? null, date: r.date ?? null }]));
  for (const r of out.rounds) if (!byRound.has(r.round)) byRound.set(r.round, { round: r.round, track: null, date: null });
  out.schedule = [...byRound.values()].sort((a, b) => a.round - b.round);
  return out;
}
