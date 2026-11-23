import { collections } from '../db/index.js';
import { publicSeries } from '../views.js';
import { publicSeason } from '../season.js';
import { resolveEventType } from '../event-types.js';
import { MIN_RACES, MIN_ROUNDS, WINDOW_RACES, MULT_MIN, MULT_MAX, countedCorners } from '../../stake-rules.js';

// Stake: a driver's share of every point the season has paid out, scaled by
// how cleanly they raced, as a percentage. It is the club's steering weight —
// when a season closes, a driver's stake is what they spend in the vote on the
// cars and tracks that follow (see src/lib/server/vote, ../track-selection) —
// so the page shows not just where it stands but how it moved, session by
// session.
//
// A season is a window of time (see ../season.js), and every session that ran
// inside it counts — the rounds of its series and any single session — unless
// the admin excluded it at upload (`stakeSeason` on the subsession). Nothing
// is dropped: the standings' drop rule is a championship rule, not a stake
// one. Points are each session's scored totals (a round's multiplier
// included), so the pool is simply everything paid, and a one-off counts
// exactly what its own points format paid.
//
// The clean-driving multiplier (constants in src/lib/stake-rules.js): each
// driver's incidents per corner over their last WINDOW_RACES races, placed
// against the field. A race's corners are its laps times the layout's
// corners per lap, an oval's counting half (see countedCorners). A driver at the median rate is 1.0x. Rougher than the
// median, the multiplier falls in a straight line to MULT_MIN at the roughest
// calculated driver, so only that driver is at the floor and the rest of the
// rough half sit between the floor and 1.0x. Cleaner than the median it
// rises the same way to MULT_MAX at the cleanest driver. A "race" is one event
// (a round's heat and feature count together); practice and qualifying are
// left out, as is any race the driver completed no laps of (or one whose
// event has no corner count on file). The history is
// not the season's: it is every race the driver has run that the club has
// on file, whatever season (or none) it was filed to, so a driver carries
// their record from one season into the next. Until a driver has MIN_RACES
// races the multiplier is fixed at 1.0 and they do not shape the median.
// Then stake = points × multiplier, as a share of the sum of that across
// the field, so stakes always total 100%.
//
// The same MIN_RACES gates stake itself: a driver holds none until they have
// raced that many times, in any season (every race they completed a lap of,
// whether or not its event has a corner count for the rate). Until then
// their stake is 0.0% and they are left out of the share, so the rest of the
// field still totals 100%; their points wait, and count from the race that
// qualifies them. Stake is what a driver spends in the vote, so a newcomer
// has no say until they have raced a few times.
//
// Two honours ride on top: the cleanest driver (the lowest rate among those
// with a calculated multiplier, provided it beats the median) and the hot
// hand: the most points per championship round, over the same limitless
// rolling window (the driver's last WINDOW_RACES rounds of any series, in
// any season, with MIN_ROUNDS rounds or more). A round's points are what
// its session paid, before any finale multiplier. The page animates both.

// The standings' order: by stake, then points, then name.
const byStake = (a, b) => b.stake - a.stake || b.points - a.points || a.displayName.localeCompare(b.displayName);
const pct = (part, whole) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);
const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
};

// Sessions in the order they ran. startTime is ISO-8601, so string order is
// chronological; sessions without one fall back to round order.
const byStart = (a, b) =>
  (a.startTime ?? '').localeCompare(b.startTime ?? '') || (a.round ?? 0) - (b.round ?? 0) || String(a._id).localeCompare(String(b._id));

/**
 * The clean-driving multiplier for every driver. Pure. `drivers` carry their
 * races so far, oldest first, each { incidents, corners } with corners > 0.
 * Returns { median, byDriver: Map custId → { ipc, multiplier, fixed } }: `ipc`
 * is the rolling incidents-per-corner rate over whatever races the driver has
 * (null with none at all), `fixed` whether the driver is still under
 * MIN_RACES, in which case the rate is shown but the multiplier stays 1 and
 * the rate shapes neither the median nor the field's extremes. The
 * multiplier is the driver's distance from the median as a fraction of the
 * distance from the median to the field's roughest (or cleanest) calculated
 * rate, scaled to [MULT_MIN, 1] or [1, MULT_MAX]. An unrounded multiplier:
 * round only for display.
 */
export function multipliers(drivers) {
  const rate = new Map();
  for (const d of drivers) {
    if (!d.races.length) continue;
    const window = d.races.slice(-WINDOW_RACES);
    const incidents = window.reduce((a, r) => a + r.incidents, 0);
    const corners = window.reduce((a, r) => a + r.corners, 0);
    rate.set(d.custId, incidents / corners);
  }
  const rates = drivers.filter((d) => d.races.length >= MIN_RACES).map((d) => rate.get(d.custId));
  const med = median(rates);
  const best = rates.length ? Math.min(...rates) : 0;
  const worst = rates.length ? Math.max(...rates) : 0;
  const scale = (ipc) => {
    if (ipc === med) return 1;
    // Rougher: 1 at the median down to MULT_MIN at the roughest driver.
    if (ipc > med) return 1 - (1 - MULT_MIN) * ((ipc - med) / (worst - med));
    // Cleaner: 1 at the median up to MULT_MAX at the cleanest driver.
    return 1 + (MULT_MAX - 1) * ((med - ipc) / (med - best));
  };
  const byDriver = new Map();
  for (const d of drivers) {
    const ipc = rate.get(d.custId) ?? null;
    const fixed = d.races.length < MIN_RACES;
    const multiplier = fixed || med === 0 ? 1 : clamp(scale(ipc), MULT_MIN, MULT_MAX);
    byDriver.set(d.custId, { ipc, multiplier, fixed });
  }
  return { median: med, byDriver };
}

/**
 * Fold the sessions filed to a season into per-driver stake trajectories. Pure.
 * `isRound(doc)` says whether a doc is a round of the season's own series (it
 * then keeps its round number; by default any doc with a round is) and
 * `multiplier(doc)` its points multiplier (1 by default). `history` is every
 * other session on file, from any season or none: they pay nothing and are
 * no step, but the races in them feed each driver's rolling incident
 * record, in time order with the season's own.
 * Returns:
 *   steps    — the sessions that have run, in order: { id, seriesSlug, round,
 *              title, kind, track, config, date, pool } where pool is every
 *              point paid across the field up to and including that session,
 *              round is null for a session that is not one of the season's
 *              rounds (seriesSlug is null for a single session), and kind is
 *              'league' for a round, else what `kindOf` says
 *   pool     — the final pool
 *   drivers  — sorted by current stake, then points: { custId, displayName,
 *              points, races, history, entered, eligible, ipc, multiplier,
 *              fixed, cleanest, rounds, pointsPerRound, hottest, stake,
 *              change, ipcChange, posChange, path: [{ id, points, stake,
 *              earned, finish, ipc, pos }] }. `races` is the
 *              season's sessions the driver took part in (a finish, or
 *              points), `history` how many races in all count toward the
 *              multiplier (see `multipliers`), `entered` how many races in
 *              all they completed a lap of and `eligible` whether that has
 *              reached MIN_RACES (until it has, stake is 0 and `wouldBe` is
 *              the stake they would hold if it had; null once eligible),
 *              `ipc`, `multiplier` and `fixed` the multiplier's parts after
 *              the latest session, and `cleanest` marks the lowest rate in the
 *              field (ties share it). `rounds` is how many championship
 *              rounds the driver has raced in all, `pointsPerRound` their
 *              average over the last WINDOW_RACES of them (null under
 *              MIN_ROUNDS), and `hottest` marks the field's best.
 *              `path` starts at the driver's first session
 *              and has an entry for every session since, sat out or not;
 *              `earned` is what the session paid them, `finish` where they
 *              finished its race (the feature, else the heat; null when they
 *              did not race), and `stake` their stake after it, the multiplier
 *              as it stood then, `ipc` their rate after it, and `pos` their
 *              place in the standings after it (the order `drivers` is
 *              in); `change` is the move in stake (percentage points) since
 *              the previous session, null for a driver's debut, and
 *              `posChange` the places gained since it (negative for lost).
 */
// `kindOf` names a session that is not one of the season's rounds: 'single'
// or 'special' (see ../results.js); a round is 'league'.
export function foldStake(docs, { isRound = (d) => d.round != null, multiplier = () => 1, kindOf = () => 'single', history = [] } = {}) {
  const byDriver = new Map();
  // Every driver's races on file, oldest first: { incidents, corners } per
  // event (corners being laps × the layout's counted corners per lap); and
  // the points each championship round paid them, oldest first.
  const racesOf = new Map();
  const roundsOf = new Map();
  // And how many races in all each driver has completed a lap of, for stake's gate.
  const enteredOf = new Map();
  const push = (map, key, v) => (map.get(key) ?? map.set(key, []).get(key)).push(v);
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const eligible = (custId) => (enteredOf.get(custId) ?? 0) >= MIN_RACES;
  const steps = [];
  let pool = 0;
  const prior = new Set(history.map((d) => d._id));
  for (const d of [...docs, ...history].sort(byStart)) {
    // A session outside the season: only its races (and, for a round of
    // some series, its points) are recorded.
    const cpl = countedCorners(d.track);
    if (prior.has(d._id)) {
      const raced = new Map();
      for (const s of d.simsessions ?? []) {
        for (const r of s.results ?? []) {
          const run = raced.get(r.custId) ?? { incidents: 0, laps: 0, points: 0, finished: false };
          run.points += r.points?.total ?? 0;
          if (s.kind !== 'feature' && s.kind !== 'sprint') continue;
          run.incidents += r.incidents ?? 0;
          run.laps += r.lapsComplete ?? 0;
          if (r.finish != null) run.finished = true;
          raced.set(r.custId, run);
        }
      }
      for (const [custId, run] of raced) {
        if (run.laps > 0) bump(enteredOf, custId);
        if (run.laps > 0 && cpl != null) push(racesOf, custId, { incidents: run.incidents, corners: run.laps * cpl });
        if (d.round != null && d.seriesSlug && (run.finished || run.points > 0)) push(roundsOf, custId, run.points);
      }
      continue;
    }
    const own = d.round != null && isRound(d);
    const round = own ? d.round : null;
    const mult = own ? multiplier(d) ?? 1 : 1;
    const paid = new Map();
    const finishes = new Map();
    // The event as one race: incidents and laps across its heat and feature,
    // and what it paid before the round's multiplier.
    const raced = new Map();
    const rawPaid = new Map();
    for (const s of d.simsessions ?? []) {
      const isRace = s.kind === 'feature' || s.kind === 'sprint';
      for (const r of s.results ?? []) {
        let drv = byDriver.get(r.custId);
        if (!drv) {
          drv = { custId: r.custId, displayName: r.displayName, points: 0, stake: 0, change: null, ipcChange: null, posChange: null, path: [] };
          byDriver.set(r.custId, drv);
        }
        drv.displayName = r.displayName;
        paid.set(r.custId, (paid.get(r.custId) ?? 0) + (r.points?.total ?? 0) * mult);
        rawPaid.set(r.custId, (rawPaid.get(r.custId) ?? 0) + (r.points?.total ?? 0));
        if (isRace) {
          const run = raced.get(r.custId) ?? { incidents: 0, laps: 0 };
          run.incidents += r.incidents ?? 0;
          run.laps += r.lapsComplete ?? 0;
          raced.set(r.custId, run);
        }
        // The race result: the feature's finish, or the heat's when there was no feature.
        if (s.kind === 'feature' || (s.kind === 'sprint' && finishes.get(r.custId) == null)) finishes.set(r.custId, r.finish ?? null);
      }
    }
    for (const [custId, pts] of paid) {
      byDriver.get(custId).points += pts;
      pool += pts;
    }
    // A race the driver completed no laps of does not count toward the
    // window, nor does one whose event has no corner count.
    for (const [custId, run] of raced) {
      if (run.laps > 0) bump(enteredOf, custId);
      if (run.laps > 0 && cpl != null) push(racesOf, custId, { incidents: run.incidents, corners: run.laps * cpl });
    }
    // A championship round the driver raced (or that paid them) joins their record.
    if (own) {
      for (const drv of byDriver.values()) {
        if (finishes.get(drv.custId) != null || (rawPaid.get(drv.custId) ?? 0) > 0) push(roundsOf, drv.custId, rawPaid.get(drv.custId) ?? 0);
      }
    }
    const step = {
      id: d._id, seriesSlug: d.seriesSlug ?? null, round, title: d.title ?? null, kind: own ? 'league' : kindOf(d),
      track: d.track?.name ?? null, config: d.track?.config ?? null, date: d.startTime ?? null, pool,
    };
    steps.push(step);
    // Stake after this session: points × the multiplier as it stands now, as
    // a share of that across the eligible field (a driver under MIN_RACES
    // holds 0 and is left out of the share). Everyone seen so far gets a
    // point on this step: a driver who sat it out still moves, since the
    // pool (and the field's multipliers) changed around them.
    const { byDriver: mults } = multipliers([...byDriver.values()].map((drv) => ({ custId: drv.custId, races: racesOf.get(drv.custId) ?? [] })));
    let adjustedPool = 0;
    for (const drv of byDriver.values()) if (eligible(drv.custId)) adjustedPool += drv.points * mults.get(drv.custId).multiplier;
    for (const drv of byDriver.values()) {
      const m = mults.get(drv.custId);
      drv.eligible = eligible(drv.custId);
      const stake = drv.eligible ? pct(drv.points * m.multiplier, adjustedPool) : 0;
      // What a provisional driver would hold if they were eligible now: their
      // weighted points joining the share they are left out of.
      drv.wouldBe = drv.eligible ? null : pct(drv.points * m.multiplier, adjustedPool + drv.points * m.multiplier);
      const prev = drv.path.at(-1);
      drv.path.push({ id: step.id, points: drv.points, stake, earned: paid.get(drv.custId) ?? 0, finish: finishes.get(drv.custId) ?? null, ipc: m.ipc, pos: null });
      drv.stake = stake;
      drv.change = prev ? round1(stake - prev.stake) : null;
      // The move in the rate since the session before (unrounded; null until
      // there are two rates to compare). Down is cleaner.
      drv.ipcChange = prev && prev.ipc != null && m.ipc != null ? m.ipc - prev.ipc : null;
      drv.ipc = m.ipc;
      drv.multiplier = m.multiplier;
      drv.fixed = m.fixed;
    }
    // The standings after this session, in the order the page lists them.
    [...byDriver.values()].sort(byStake).forEach((drv, i) => {
      const now = drv.path.at(-1), before = drv.path.at(-2);
      now.pos = i + 1;
      drv.posChange = before ? before.pos - now.pos : null;
    });
  }

  const average = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const drivers = [...byDriver.values()]
    .map((drv) => {
      const rounds = roundsOf.get(drv.custId) ?? [];
      return {
        ...drv, races: drv.path.filter((p) => p.finish != null || p.earned > 0).length,
        history: racesOf.get(drv.custId)?.length ?? 0, entered: enteredOf.get(drv.custId) ?? 0, cleanest: false, hottest: false,
        rounds: rounds.length, pointsPerRound: rounds.length >= MIN_ROUNDS ? average(rounds.slice(-WINDOW_RACES)) : null,
      };
    })
    .sort(byStake);
  // The honours: the cleanest calculated rate, if it beats the median
  // (multiplier above 1), and the best points per round, if anyone has one.
  const rated = drivers.filter((d) => !d.fixed && d.multiplier > 1);
  const best = Math.min(...rated.map((d) => d.ipc));
  for (const d of rated) if (d.ipc === best) d.cleanest = true;
  const averaged = drivers.filter((d) => d.pointsPerRound > 0);
  const top = Math.max(...averaged.map((d) => d.pointsPerRound));
  for (const d of averaged) if (d.pointsPerRound === top) d.hottest = true;
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
  // Every other session on file, for the drivers' incident records: just the
  // race rows' incidents and laps, and the layout's corners.
  const history = await subsessions.find({ stakeSeason: { $ne: seasonSlug } }, { projection: {
    startTime: 1, round: 1, seriesSlug: 1, 'track.corners': 1, 'track.category': 1, 'simsessions.kind': 1,
    'simsessions.results.custId': 1, 'simsessions.results.incidents': 1, 'simsessions.results.lapsComplete': 1, 'simsessions.results.finish': 1, 'simsessions.results.points.total': 1,
  } }).toArray();
  const own = await series.find({ season: seasonSlug }).sort({ createdAt: 1 }).toArray();
  const slugs = new Set([...own.map((x) => x.slug), ...docs.map((d) => d.seriesSlug).filter(Boolean)]);
  const bySlug = new Map((await series.find({ slug: { $in: [...slugs] } }).toArray()).map((x) => [x.slug, x]));
  const ownSlugs = new Set(own.map((x) => x.slug));
  const multiplierOf = (d) => (bySlug.get(d.seriesSlug)?.schedule ?? []).find((r) => r.round === d.round)?.multiplier ?? 1;

  const out = foldStake(docs, {
    isRound: (d) => ownSlugs.has(d.seriesSlug), multiplier: multiplierOf,
    kindOf: (d) => (resolveEventType(d.eventType).category === 'special' ? 'special' : 'single'),
    history,
  });
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
