import { collections } from '../db/index.js';
import { publicSeries } from '../views.js';
import { publicSeason } from '../season.js';

// Stake: a driver's share of every point the season has paid out, as a
// percentage. It is the club's steering weight — when a season closes, a
// driver's stake is what they spend in the vote on the cars and tracks that
// follow (see src/lib/server/vote, ../track-selection) — so the page shows not
// just where it stands but how it moved, session by session.
//
// A season is a window of time (see ../season.js), and every session that ran
// inside it counts — the rounds of its series and any special event — unless
// the admin excluded it at upload (`stakeSeason` on the subsession). Nothing
// is dropped: the standings' drop rule is a championship rule, not a stake
// one. Points are each session's scored totals (a round's multiplier
// included), so the pool is simply everything paid, and a one-off counts
// exactly what its own points format paid.

const pct = (part, whole) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);
const round1 = (x) => Math.round(x * 10) / 10;

// Sessions in the order they ran. startTime is ISO-8601, so string order is
// chronological; sessions without one fall back to round order.
const byStart = (a, b) =>
  (a.startTime ?? '').localeCompare(b.startTime ?? '') || (a.round ?? 0) - (b.round ?? 0) || String(a._id).localeCompare(String(b._id));

/**
 * Fold the sessions filed to a season into per-driver stake trajectories. Pure.
 * `isRound(doc)` says whether a doc is a round of the season's own series (it
 * then keeps its round number; by default any doc with a round is) and
 * `multiplier(doc)` its points multiplier (1 by default).
 * Returns:
 *   steps    — the sessions that have run, in order: { id, seriesSlug, round,
 *              title, track, config, date, pool } where pool is every point
 *              paid across the field up to and including that session, and
 *              round is null for a session that is not one of the season's
 *              rounds (seriesSlug is null for a special event)
 *   pool     — the final pool
 *   drivers  — sorted by current stake, then points: { custId, displayName,
 *              points, stake, change, path: [{ id, points, stake, earned,
 *              finish }] }. `path` starts at the driver's first session and
 *              has an entry for every session since, sat out or not; `earned`
 *              is what the session paid them and `finish` where they finished
 *              its race (the feature, else the heat; null when they did not
 *              race); `change` is the move in stake (percentage points) since
 *              the previous session, null for a driver's debut.
 */
export function foldStake(docs, { isRound = (d) => d.round != null, multiplier = () => 1 } = {}) {
  const byDriver = new Map();
  const steps = [];
  let pool = 0;
  for (const d of [...docs].sort(byStart)) {
    const own = d.round != null && isRound(d);
    const round = own ? d.round : null;
    const mult = own ? multiplier(d) ?? 1 : 1;
    const paid = new Map();
    const finishes = new Map();
    for (const s of d.simsessions ?? []) {
      for (const r of s.results ?? []) {
        let drv = byDriver.get(r.custId);
        if (!drv) {
          drv = { custId: r.custId, displayName: r.displayName, points: 0, stake: 0, change: null, path: [] };
          byDriver.set(r.custId, drv);
        }
        drv.displayName = r.displayName;
        paid.set(r.custId, (paid.get(r.custId) ?? 0) + (r.points?.total ?? 0) * mult);
        // The race result: the feature's finish, or the heat's when there was no feature.
        if (s.kind === 'feature' || (s.kind === 'sprint' && finishes.get(r.custId) == null)) finishes.set(r.custId, r.finish ?? null);
      }
    }
    for (const [custId, pts] of paid) {
      byDriver.get(custId).points += pts;
      pool += pts;
    }
    const step = {
      id: d._id, seriesSlug: d.seriesSlug ?? null, round, title: d.title ?? null,
      track: d.track?.name ?? null, config: d.track?.config ?? null, date: d.startTime ?? null, pool,
    };
    steps.push(step);
    // Everyone seen so far gets a point on this step: a driver who sat it out
    // still moves, since the pool grew around them.
    for (const drv of byDriver.values()) {
      const stake = pct(drv.points, pool);
      const prev = drv.path.at(-1);
      drv.path.push({ id: step.id, points: drv.points, stake, earned: paid.get(drv.custId) ?? 0, finish: finishes.get(drv.custId) ?? null });
      drv.stake = stake;
      drv.change = prev ? round1(stake - prev.stake) : null;
    }
  }

  const drivers = [...byDriver.values()].sort((a, b) =>
    b.stake - a.stake || b.points - a.points || a.displayName.localeCompare(b.displayName));
  return { steps, pool, drivers };
}

/**
 * Stake for a season — named by `seasonSlug`, or by `seriesSlug` as the season
 * that series belongs to (the vote and track selection name a series). The
 * chart's axis comes alongside: every session that has run, in order, then
 * the scheduled rounds of the season's series still to come, so the chart can
 * lay out the whole season and name each step's track. Steps carry the
 * series they belong to; `axis` items are steps plus { run }, a round still
 * to come having run: false. A season with nothing filed folds to nothing;
 * no season at all gives season: null.
 */
export async function computeStake(db, { seasonSlug = null, seriesSlug = null }) {
  const { subsessions, series, seasons } = collections(db);
  if (!seasonSlug && seriesSlug) seasonSlug = (await series.findOne({ slug: seriesSlug }, { projection: { season: 1 } }))?.season ?? null;
  const season = seasonSlug ? await seasons.findOne({ _id: seasonSlug }) : null;
  if (!season) return { season: null, series: [], steps: [], pool: 0, drivers: [], axis: [] };

  const docs = await subsessions.find({ stakeSeason: seasonSlug }, { projection: { raw: 0 } }).toArray();
  const own = await series.find({ season: seasonSlug }).sort({ createdAt: 1 }).toArray();
  const slugs = new Set([...own.map((x) => x.slug), ...docs.map((d) => d.seriesSlug).filter(Boolean)]);
  const bySlug = new Map((await series.find({ slug: { $in: [...slugs] } }).toArray()).map((x) => [x.slug, x]));
  const ownSlugs = new Set(own.map((x) => x.slug));
  const multiplierOf = (d) => (bySlug.get(d.seriesSlug)?.schedule ?? []).find((r) => r.round === d.round)?.multiplier ?? 1;

  const out = foldStake(docs, { isRound: (d) => ownSlugs.has(d.seriesSlug), multiplier: multiplierOf });
  const nameOf = (slug) => (slug ? bySlug.get(slug)?.name ?? slug : null);
  for (const st of out.steps) st.seriesName = nameOf(st.seriesSlug);

  // Rounds of the season's series still to come, after everything that has run.
  const run = new Set(out.steps.filter((st) => st.round != null).map((st) => `${st.seriesSlug}:${st.round}`));
  const upcoming = own.flatMap((x) => (x.schedule ?? [])
    .filter((r) => !run.has(`${x.slug}:${r.round}`))
    .map((r) => ({ id: `${x.slug}:round:${r.round}`, seriesSlug: x.slug, seriesName: x.name, round: r.round, title: null, track: r.track ?? null, config: null, date: r.date ?? null, pool: null, run: false })));
  out.axis = [...out.steps.map((st) => ({ ...st, run: true })), ...upcoming];
  return { season: publicSeason(season), series: own.map(publicSeries), ...out };
}
