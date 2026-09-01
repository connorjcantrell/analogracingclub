import { collections } from '../db/index.js';

// Series standings: fold every stored result into per-driver totals with a
// per-round breakdown. Sorted by total, then feature wins, sprint wins, poles.
export async function computeStandings(db, { seriesSlug }) {
  const { subsessions, series } = collections(db);
  const s = await series.findOne({ slug: seriesSlug });
  const docs = await subsessions.find({ seriesSlug }, { projection: { raw: 0 } }).toArray();
  const out = foldStandings(docs);
  // Show every scheduled round (even ones not yet run), plus any extra rounds seen.
  const scheduled = (s?.schedule ?? []).map((r) => r.round);
  out.rounds = [...new Set([...scheduled, ...out.rounds])].sort((a, b) => a - b);
  return out;
}

export function foldStandings(docs) {
  const byDriver = new Map();
  const rounds = new Set();
  for (const d of docs) {
    const round = d.round ?? d._id;
    rounds.add(round);
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
        row.rounds[round] = (row.rounds[round] ?? 0) + pts;
        row.total += pts;
        if (s.kind === 'qualifying') { row.qualifying += pts; if (r.finish === 1) row.poles += 1; }
        if (s.kind === 'sprint') { row.sprint += pts; if (r.finish === 1) row.sprintWins += 1; row.lapsLed += r.lapsLead ?? 0; }
        if (s.kind === 'feature') { row.feature += pts; if (r.finish === 1) row.featureWins += 1; row.lapsLed += r.lapsLead ?? 0; row.starts += 1; }
      }
    }
  }
  const standings = [...byDriver.values()].sort((a, b) =>
    b.total - a.total || b.featureWins - a.featureWins || b.sprintWins - a.sprintWins ||
    b.poles - a.poles || a.displayName.localeCompare(b.displayName));
  return { rounds: [...rounds].sort((a, b) => a - b), standings };
}
