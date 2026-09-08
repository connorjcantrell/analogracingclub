// The homepage sidebar: what a reader wants at a glance beside the feed. It is
// keyed off the season state, not the newest post's type, so it doesn't flip
// when a one-off special runs mid-season:
//   - an active series  → that series' top of the standings
//   - otherwise         → the top of the power ranking (provisional drivers skipped)
// plus the next scheduled round of the active (else next upcoming) series,
// linking to its event page or, failing that, Discord.
import { collections } from './db/index.js';
import { computeStandings } from './standings/index.js';
import { computePowerRanking } from './power/index.js';
import { publicSeries } from './views.js';

const TOP = 5;

export async function buildSidebar(db) {
  const { series: seriesCol, subsessions } = collections(db);
  const all = await seriesCol.find({}).sort({ createdAt: -1 }).toArray();
  const active = all.find((s) => s.status === 'active') ?? null;

  const [standings, power, nextRound] = await Promise.all([
    active ? topStandings(db, active) : null,
    active ? null : topPower(db),
    findNextRound(subsessions, active ? [active, ...all.filter((s) => s.status === 'upcoming')] : all.filter((s) => s.status === 'upcoming')),
  ]);
  return { standings, power, nextRound };
}

async function topStandings(db, s) {
  const out = await computeStandings(db, { seriesSlug: s.slug });
  return {
    series: publicSeries(s),
    rows: out.standings.slice(0, TOP).map((d) => ({ custId: d.custId, displayName: d.displayName, total: d.total, change: d.change ?? null })),
  };
}

async function topPower(db) {
  const { drivers } = await computePowerRanking(db, {});
  return drivers.filter((d) => !d.provisional).slice(0, TOP)
    .map((d) => ({ custId: d.custId, displayName: d.displayName, change: d.change ?? null }));
}

// The first scheduled round without a stored result, across the given series
// in order. A series whose rounds have all run contributes nothing.
async function findNextRound(subsessions, candidates) {
  for (const s of candidates) {
    const run = new Set((await subsessions.find({ seriesSlug: s.slug }, { projection: { round: 1 } }).toArray()).map((d) => d.round));
    const row = (s.schedule ?? []).find((r) => !run.has(r.round));
    if (row) return { series: { slug: s.slug, name: s.name }, round: row.round, track: row.track ?? null, date: row.date ?? null, link: row.link ?? null, image: row.image ?? null, multiplier: row.multiplier ?? 1 };
  }
  return null;
}
