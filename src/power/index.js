import { collections } from '../db/index.js';

// Driver power ranking.
//
// Five metrics, each reduced to one number per driver and then RANKED across
// the field. The rank is what scores: sort everyone by a metric and spread
// 0-100 evenly across them, best to worst. Because every category lands on the
// same scale whatever its units — placings, lap positions, cars passed — the
// weights below actually mean what they say, and no single runaway value can
// dominate the rating.
//
//   overall     avg finishing place over each whole event  (weight 35)
//   gained      avg cars passed — start minus finish —     (weight 15)
//               across every official session
//   bestLap     avg placing on best lap, per session       (weight 15)
//   avgLap      avg placing on MEAN lap, per session        (weight 15)
//               — sustained pace, where bestLap is one hot lap
//   lapsLed     avg share of a race's led laps             (weight 15)
//   finishing   share of races seen to the flag            (weight  5)
//
// Ranking deliberately discards margin, so winning a category by a mile scores
// the same as winning it narrowly. `marginToLeader` is reported alongside to
// put that back: how far a driver's average event finish sits behind the
// leader's, in places.
export const WEIGHTS = { overall: 35, gained: 15, bestLap: 15, avgLap: 15, lapsLed: 15, finishing: 5 };

// Sessions that count. Practice never does.
export const OFFICIAL = ['qualifying', 'sprint', 'feature'];

// The published rating is mapped onto RATING_FLOOR..100 rather than 0..100.
// The scale is rank-based, so someone is always last and would otherwise post
// a bare 0; a floor keeps the bottom of the table readable without changing
// the order. Components stay on the raw 0-100 scale for diagnostics.
export const RATING_FLOOR = 45;
export const scaleRating = (score) => RATING_FLOOR + (score / 100) * (100 - RATING_FLOOR);

// Events a driver must have entered before they are ranked. Below this they
// still appear, flagged provisional and sorted last, so one strong outing
// cannot put a newcomer above the regulars.
export const MIN_EVENTS = 3;

// Recency, counted over the events a driver ACTUALLY ENTERED rather than over
// the league calendar. A driver returning after a break is judged on their own
// last few outings instead of being decayed for the rounds they missed.
//
// Their three most recent races count in full, the next six taper away, and
// anything older than ten races is dropped entirely:
//
//   races 1-3 (newest)  1.00
//   race  4             0.86
//   race  6             0.57
//   race  10            0.14
//   race  11+           dropped entirely
export const RECENT_FULL = 3;   // races at full weight
export const TAPER_OVER = 7;    // races the taper is spread across
export const MAX_RACES = RECENT_FULL + TAPER_OVER; // 10: nothing older counts

// `age` is 0 for a driver's most recent race, 1 for the one before, and so on.
// Every one of the ten most recent races carries some weight; the eleventh and
// anything beyond it is not counted at all.
export const recencyWeight = (age) => {
  if (age < RECENT_FULL) return 1;
  if (age >= MAX_RACES) return 0;
  return 1 - (age - RECENT_FULL + 1) / (TAPER_OVER + 1);
};

// "Overall" means the result of the weekend as a whole, and what that means
// depends on the event. A scored series round is won on total points across
// its sessions; a special event awards none, so the feature finish IS the
// result. Returns driver ids best-first, or null when the event cannot be
// ranked overall.
export function overallOrder(doc) {
  const sessions = (doc.simsessions ?? []).filter((s) => s.kind !== 'practice');
  if (!sessions.length) return null;

  const points = new Map();
  let anyPoints = false;
  for (const s of sessions) {
    for (const r of s.results ?? []) {
      const pts = r.points?.total ?? 0;
      if (pts) anyPoints = true;
      points.set(r.custId, (points.get(r.custId) ?? 0) + pts);
    }
  }

  // Unscored (a special event, or a series whose points are all zero): fall
  // back to the feature, then the sprint — whichever race actually ran.
  if (!anyPoints) {
    const race = sessions.find((s) => s.kind === 'feature') ?? sessions.find((s) => s.kind === 'sprint');
    if (!race) return null;
    return (race.results ?? [])
      .filter((r) => r.finish != null)
      .sort((a, b) => a.finish - b.finish)
      .map((r) => r.custId);
  }

  // Scored: most points wins, with the feature finish breaking ties.
  const featureFinish = new Map(
    (sessions.find((s) => s.kind === 'feature')?.results ?? [])
      .filter((r) => r.finish != null)
      .map((r) => [r.custId, r.finish]));
  return [...points.entries()]
    .sort((a, b) => b[1] - a[1] ||
      (featureFinish.get(a[0]) ?? Infinity) - (featureFinish.get(b[0]) ?? Infinity))
    .map(([custId]) => custId);
}

/**
 * Spread 0-100 evenly over a ranked field: best scores 100, worst 0, and ties
 * share the average of the places they span. A field of one scores 50 — a lone
 * entry says nothing about form either way.
 * `entries` are { key, value }; a null value is unranked and simply omitted.
 */
export function rankScores(entries, { higherIsBetter = true } = {}) {
  const out = new Map();
  const rated = entries.filter((e) => e.value != null);
  if (!rated.length) return out;
  if (rated.length === 1) return out.set(rated[0].key, 50);

  const sorted = [...rated].sort((a, b) =>
    higherIsBetter ? b.value - a.value : a.value - b.value);
  const step = 100 / (sorted.length - 1);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j += 1;
    const score = 100 - ((i + j) / 2) * step;
    for (let k = i; k <= j; k += 1) out.set(sorted[k].key, score);
    i = j + 1;
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// Samples are { v, w }; a zero total weight means no usable data.
const wmean = (xs) => {
  const w = xs.reduce((a, x) => a + x.w, 0);
  return w > 0 ? xs.reduce((a, x) => a + x.v * x.w, 0) / w : null;
};
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Fold stored subsessions into a power ranking. Pure — takes documents,
 * returns rows. Drivers under `minEvents` (default MIN_EVENTS) are still
 * returned but flagged `provisional`, so a newcomer is visible without
 * outranking regulars on one lucky result.
 */
export function computePower(docs, { minEvents = MIN_EVENTS } = {}) {
  const byDriver = new Map();
  const get = (r) => {
    let row = byDriver.get(r.custId);
    if (!row) {
      row = {
        custId: r.custId, displayName: r.displayName, events: 0,
        overall: [], bestLap: [], avgLap: [], gained: [], lapsLed: [], classified: [],
        starts: 0, wins: 0, podiums: 0, poles: 0, lapsLedTotal: 0, points: 0,
        overallWins: 0, gainedTotal: 0,
        bestFinish: null, qualPos: [], racePos: [], overallPos: [],
      };
      byDriver.set(r.custId, row);
    }
    row.displayName = r.displayName;
    return row;
  };

  // Newest first, so index == age in events. Undated events sort last.
  const ordered = [...docs].sort((a, b) =>
    new Date(b.startTime ?? 0) - new Date(a.startTime ?? 0));

  // How many of this driver's own races we have already walked past. Ordered
  // newest-first, so this is their personal age for the event in hand.
  const raceAge = new Map();
  const ageOf = (custId) => raceAge.get(custId) ?? 0;

  for (const d of ordered) {
    const seen = new Set();
    // Weight for this event, per driver — resolved lazily so a driver's own
    // history decides it rather than the league calendar.
    const weightFor = (custId) => recencyWeight(ageOf(custId));

    for (const s of d.simsessions ?? []) {
      if (!OFFICIAL.includes(s.kind)) continue;
      const results = s.results ?? [];
      const classified = results.filter((r) => r.finish != null);
      if (!classified.length) continue;

      // Lap-time placing WITHIN this session: 1st = fastest. Averaging these
      // across the weekend rewards a driver who is consistently quick, and
      // stops one missed session from skewing the picture.
      const placeBy = (field) => new Map(results
        .filter((r) => r[field] > 0)
        .sort((a, b) => a[field] - b[field])
        .map((r, i) => [r.custId, i + 1]));
      const lapPlace = placeBy('bestLapTime');
      const avgLapPlace = placeBy('averageLapTime');

      const ledTotal = results.reduce((a, r) => a + (r.lapsLead ?? 0), 0);

      for (const r of results) {
        const row = get(r);
        seen.add(r.custId);
        row.points += r.points?.total ?? 0;

        const place = lapPlace.get(r.custId);
        const w = weightFor(r.custId);
        if (place != null) row.bestLap.push({ v: place, w });
        const avgPlace = avgLapPlace.get(r.custId);
        if (avgPlace != null) row.avgLap.push({ v: avgPlace, w });

        // Cars passed: started 8th, finished 3rd => +5. Qualifying counts too
        // where a grid position was recorded.
        if (r.finish != null && r.start != null) {
          const passed = r.start - r.finish;
          row.gained.push({ v: passed, w });
          row.gainedTotal += passed;
        }

        if (s.kind === 'qualifying') {
          if (r.finish != null) {
            row.qualPos.push(r.finish);
            if (r.finish === 1) row.poles += 1;
          }
          continue;
        }

        // Sprint and feature.
        row.starts += 1;
        row.classified.push({ v: r.finish != null ? 1 : 0, w });
        if (r.finish != null) {
          row.racePos.push(r.finish);
          if (r.finish === 1) row.wins += 1;
          if (r.finish <= 3) row.podiums += 1;
          if (row.bestFinish == null || r.finish < row.bestFinish) row.bestFinish = r.finish;
        }
        row.lapsLedTotal += r.lapsLead ?? 0;
        row.lapsLed.push({ v: ledTotal > 0 ? (r.lapsLead ?? 0) / ledTotal : 0, w });
      }
    }

    // Where the driver placed over the event as a whole.
    const order = overallOrder(d);
    if (order?.length) {
      order.forEach((custId, i) => {
        const row = byDriver.get(custId);
        if (!row) return;
        row.overall.push({ v: i + 1, w: weightFor(custId) });
        row.overallPos.push(i + 1);
        if (i === 0) row.overallWins += 1;
      });
    }

    for (const custId of seen) {
      byDriver.get(custId).events += 1;
      raceAge.set(custId, ageOf(custId) + 1);
    }
  }

  // One averaged value per driver per metric, recency-weighted.
  const rows = [...byDriver.values()].map((row) => ({
    row,
    values: {
      overall: wmean(row.overall),     // lower is better
      bestLap: wmean(row.bestLap),     // lower is better
      avgLap: wmean(row.avgLap),       // lower is better
      gained: wmean(row.gained),       // higher is better
      lapsLed: wmean(row.lapsLed),     // higher is better
      finishing: wmean(row.classified),// higher is better
    },
  }));

  // Rank the field within each metric, so every category scores on one scale.
  const LOWER_IS_BETTER = new Set(['overall', 'bestLap', 'avgLap']);
  const ranked = Object.fromEntries(Object.keys(WEIGHTS).map((metric) => [
    metric,
    rankScores(rows.map((r) => ({ key: r.row.custId, value: r.values[metric] })),
      { higherIsBetter: !LOWER_IS_BETTER.has(metric) }),
  ]));

  // Margin the ranking throws away: places behind the best average finish.
  const bestOverall = Math.min(...rows.map((r) => r.values.overall).filter((v) => v != null), Infinity);

  const out = rows.map(({ row, values }) => {
    const components = {};
    let sum = 0;
    let weight = 0;
    for (const [metric, w] of Object.entries(WEIGHTS)) {
      const score = ranked[metric].get(row.custId);
      components[metric] = score == null ? null : round1(score);
      if (score == null) continue;   // no data — do not punish the gap
      sum += score * w;
      weight += w;
    }
    return {
      custId: row.custId,
      displayName: row.displayName,
      rating: weight ? round1(scaleRating(sum / weight)) : RATING_FLOOR,
      provisional: row.events < minEvents,
      events: row.events,
      starts: row.starts,
      wins: row.wins,
      podiums: row.podiums,
      poles: row.poles,
      lapsLed: row.lapsLedTotal,
      points: row.points,
      bestFinish: row.bestFinish,
      overallWins: row.overallWins,
      avgQualifying: row.qualPos.length ? round1(mean(row.qualPos)) : null,
      avgFinish: row.racePos.length ? round1(mean(row.racePos)) : null,
      avgOverall: values.overall == null ? null : round1(values.overall),
      avgBestLap: values.bestLap == null ? null : round1(values.bestLap),
      avgLapRank: values.avgLap == null ? null : round1(values.avgLap),
      avgGained: values.gained == null ? null : round1(values.gained),
      gainedTotal: row.gainedTotal,
      marginToLeader: values.overall == null || !Number.isFinite(bestOverall)
        ? null : round1(values.overall - bestOverall),
      components,
    };
  });

  // Ranked drivers first, then provisional; ties fall back to points.
  out.sort((a, b) =>
    Number(a.provisional) - Number(b.provisional) ||
    b.rating - a.rating || b.points - a.points ||
    a.displayName.localeCompare(b.displayName));
  return out;
}

export async function computePowerRanking(db, { seriesSlug = null, minEvents = MIN_EVENTS } = {}) {
  const match = seriesSlug ? { seriesSlug } : {};
  const docs = await collections(db).subsessions.find(match, { projection: { raw: 0 } }).toArray();
  return { minEvents, weights: WEIGHTS, drivers: computePower(docs, { minEvents }) };
}
