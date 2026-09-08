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
//   avgLap      avg placing on MEAN lap, heats + features   (weight 15)
//               — sustained race pace, where bestLap is one hot lap (qualifying
//               is excluded: it is a hot lap or two, not a run)
//   lapsLed     avg share of a race's led laps             (removed for now)
//   finishing   share of races seen to the flag            (weight  5)
//
// Ranking deliberately discards margin, so winning a category by a mile scores
// the same as winning it narrowly. `marginToLeader` is reported alongside to
// put that back: how far a driver's average event finish sits behind the
// leader's, in places.
export const WEIGHTS = { overall: 35, gained: 15, bestLap: 15, avgLap: 15, /* lapsLed: 15, */ finishing: 5 };

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

// A rival must share at least this many races — enough history to mean
// something — except for a driver who has raced fewer times than that, where
// the bar drops to their own race count.
export const RIVAL_MIN_RACES = 3;

// Recency, counted over the events a driver ACTUALLY ENTERED rather than over
// the league calendar. A driver returning after a break is judged on their own
// last few outings instead of being decayed for the rounds they missed.
//
// The last five races count, each older one losing twenty percentage points:
//
//   race 1 (newest)  1.00
//   race 2           0.80
//   race 3           0.60
//   race 5           0.20
//   race 6+          dropped entirely
export const MAX_RACES = 5; // races beyond the last five do not count

// `age` is 0 for a driver's most recent race, 1 for the one before, and so on.
// Each step back sheds 20% until the fifth race is worth 0.20; the sixth and
// anything older weigh nothing.
export const recencyWeight = (age) => Math.max(0, 1 - 0.2 * age);

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
        incidents: [], incidentsTotal: 0,
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
        // avgLap is sustained race pace, so only heats and features count —
        // qualifying is a hot lap or two, not a run.
        if (s.kind !== 'qualifying') {
          const avgPlace = avgLapPlace.get(r.custId);
          if (avgPlace != null) row.avgLap.push({ v: avgPlace, w });
        }

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
        // Cleanliness (Mr. Clean): incidents per race subsession, races only.
        row.incidentsTotal += r.incidents ?? 0;
        row.incidents.push({ v: r.incidents ?? 0, w });
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
      incidentsTotal: row.incidentsTotal,
      // Recency-weighted average incidents per race subsession (Mr. Clean).
      avgIncidents: row.incidents.length ? round1(wmean(row.incidents)) : null,
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

// Solve C x = b (C symmetric positive-definite) by Gauss-Jordan elimination
// with partial pivoting. Small dense systems only — one per metric.
export function solveLinear(C, b) {
  const n = b.length;
  const M = C.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-9));
}

// Colley ratings from a weighted pairwise record. Each driver i satisfies
//   (2 + tᵢ)·rᵢ − Σ nᵢⱼ·rⱼ = 1 + (wᵢ − lᵢ)/2
// which has a unique solution in (0,1), averaging 0.5. Because each row is
// coupled to its opponents' ratings, the order is transitive: beating strong
// drivers lifts you, and two drivers who never met are still separated through
// the opponents they share. Returns Map id -> rating, or null for < 2 drivers.
export function colleyRatings({ stats, pair }) {
  const ids = [...stats.keys()].filter((id) => stats.get(id).t > 0);
  if (ids.length < 2) return null;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  ids.forEach((id, i) => {
    const s = stats.get(id);
    C[i][i] = 2 + s.t;
    b[i] = 1 + (s.w - s.l) / 2;
    for (const [oid, g] of pair.get(id) ?? []) {
      const j = idx.get(oid);
      if (j != null) C[i][j] = -g;
    }
  });
  const r = solveLinear(C, b);
  return new Map(ids.map((id, i) => [id, r[i]]));
}

// Enumerate every head-to-head matchup in one event as ONE comparison per
// metric — so a driver's matchups equal the events they entered, not the
// subsessions. Invokes cb(metric, aId, bId, outcome): 1 when a wins the event
// on that metric, 0 when b does, 0.5 for a dead tie.
//
// The event winner on a metric is decided head-to-head across the subsessions:
// whoever wins more of them (2-0, 2-1, 1-0 …) takes it. On a split (1-1, 2-2 …)
// the metric's TIE-BREAK subsession decides — qualifying for speed (best lap),
// the feature (last race) for everything else. "overall" is the whole-event
// result, a single comparison with no subsessions. Shared by the Colley rating
// and the rivalry record so both compare identically.
function eachMatchup(d, cb) {
  const sessions = (d.simsessions ?? [])
    .filter((s) => OFFICIAL.includes(s.kind))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0)); // qualifying → heat → feature (last)
  const races = sessions.filter((s) => s.kind !== 'qualifying');

  // Ordered per-subsession value maps (custId -> value) for a metric.
  const valueMaps = (sess, pick) => sess.map((s) => {
    const led = (s.results ?? []).reduce((n, r) => n + (r.lapsLead ?? 0), 0);
    const m = new Map();
    for (const r of s.results ?? []) {
      const v = pick(r, led);
      if (v != null) m.set(r.custId, v);
    }
    return m;
  });

  // Head-to-head over the event: count each pair's subsession wins; the majority
  // takes it. On a tie, the tie-break subsession (index `tb`) decides. Returns
  // null when the pair never met on this metric.
  const decide = (maps, tb, higher, aId, bId) => {
    let aw = 0;
    let bw = 0;
    let met = 0;
    for (const m of maps) {
      const av = m.get(aId);
      const bv = m.get(bId);
      if (av == null || bv == null) continue;
      met += 1;
      if (av === bv) continue;
      if (higher ? av > bv : av < bv) aw += 1; else bw += 1;
    }
    if (!met) return null;
    if (aw !== bw) return aw > bw ? 1 : 0;
    const t = maps[tb];
    const av = t?.get(aId);
    const bv = t?.get(bId);
    if (av != null && bv != null && av !== bv) return (higher ? av > bv : av < bv) ? 1 : 0;
    return 0.5;
  };

  const runMetric = (metric, maps, higher, tb) => {
    const ids = [...new Set(maps.flatMap((m) => [...m.keys()]))];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const ox = decide(maps, tb, higher, ids[i], ids[j]);
        if (ox != null) cb(metric, ids[i], ids[j], ox);
      }
    }
  };

  // Overall — the whole-event result, one comparison (lower placing is better).
  const order = overallOrder(d);
  if (order?.length) runMetric('overall', [new Map(order.map((id, i) => [id, i + 1]))], false, 0);

  // Speed (best lap): every session; a split is broken by qualifying.
  const bestMaps = valueMaps(sessions, (r) => (r.bestLapTime > 0 ? r.bestLapTime : null));
  const qi = sessions.findIndex((s) => s.kind === 'qualifying');
  runMetric('bestLap', bestMaps, false, qi >= 0 ? qi : bestMaps.length - 1);

  // The rest break a split on the feature — the last race.
  runMetric('avgLap', valueMaps(races, (r) => (r.averageLapTime > 0 ? r.averageLapTime : null)), false, races.length - 1);
  runMetric('gained', valueMaps(sessions, (r) => (r.finish != null && r.start != null ? r.start - r.finish : null)), true, sessions.length - 1);
  // Laps led removed for now:
  // runMetric('lapsLed', valueMaps(races, (r, led) => (led > 0 ? (r.lapsLead ?? 0) / led : 0)), true, races.length - 1);
  runMetric('finishing', valueMaps(races, (r) => (r.finish != null ? 1 : 0)), true, races.length - 1);
}

// The same six metrics, judged head-to-head and then blended into one order.
// Each matchup (weighted by recency) feeds a per-metric Colley solve, so the
// result is a transitive order built from who beat whom — including drivers who
// never met, ranked through common opponents.
function headToHeadComponents(docs) {
  const metrics = Object.keys(WEIGHTS);
  // metric -> { stats: id->{w,l,t}, pair: id->(id->games) }, all recency-weighted.
  const acc = Object.fromEntries(metrics.map((m) => [m, { stats: new Map(), pair: new Map() }]));
  const stat = (a, id) => { let s = a.stats.get(id); if (!s) { s = { w: 0, l: 0, t: 0 }; a.stats.set(id, s); } return s; };
  const pairMap = (a, id) => { let p = a.pair.get(id); if (!p) { p = new Map(); a.pair.set(id, p); } return p; };
  const addGame = (metric, x, y, ox, g) => {
    const a = acc[metric];
    const sx = stat(a, x), sy = stat(a, y);
    sx.t += g; sy.t += g;
    sx.w += ox * g; sx.l += (1 - ox) * g;
    sy.w += (1 - ox) * g; sy.l += ox * g;
    pairMap(a, x).set(y, (pairMap(a, x).get(y) ?? 0) + g);
    pairMap(a, y).set(x, (pairMap(a, y).get(x) ?? 0) + g);
  };

  const ordered = [...docs].sort((a, b) => new Date(b.startTime ?? 0) - new Date(a.startTime ?? 0));
  const raceAge = new Map();
  const ageOf = (id) => raceAge.get(id) ?? 0;

  for (const d of ordered) {
    const weightFor = (id) => recencyWeight(ageOf(id));
    // A matchup's weight is the average of the two drivers' recency, so a game
    // counts symmetrically for both.
    eachMatchup(d, (metric, aId, bId, ox) => {
      const g = (weightFor(aId) + weightFor(bId)) / 2;
      if (g > 0) addGame(metric, aId, bId, ox, g);
    });

    // Advance each participant's personal race age (newest-first walk), matching
    // the rank-based pass so recency lines up between the two methods.
    const seen = new Set();
    for (const s of d.simsessions ?? []) {
      if (!OFFICIAL.includes(s.kind)) continue;
      for (const r of s.results ?? []) seen.add(r.custId);
    }
    for (const id of seen) raceAge.set(id, ageOf(id) + 1);
  }

  // Colley-rate each metric's field, then assemble per-driver components on a
  // 0-100 scale (100 × the (0,1) rating). Null when the driver had no games.
  const perMetric = Object.fromEntries(metrics.map((m) => [m, colleyRatings(acc[m])]));
  const out = new Map();
  const allIds = new Set(metrics.flatMap((m) => [...acc[m].stats.keys()]));
  for (const id of allIds) {
    const comp = {};
    for (const m of metrics) {
      const r = perMetric[m]?.get(id);
      comp[m] = r == null ? null : 100 * r;
    }
    out.set(id, comp);
  }
  return out;
}

/**
 * Head-to-head power ranking. Reuses computePower for every descriptive stat
 * (wins, poles, avgFinish, marginToLeader, provisional…) and swaps only the
 * rating: each metric component becomes the driver's Colley rating from their
 * 1v1 record on that metric — a transitive order over who beat whom — then the
 * six are weighted into a single 0-100 rating.
 */
export function computeHeadToHead(docs, { minEvents = MIN_EVENTS } = {}) {
  const base = computePower(docs, { minEvents });
  const h2h = headToHeadComponents(docs);

  const rated = base.map((row) => {
    const components = {};
    let sum = 0;
    let weight = 0;
    for (const [metric, w] of Object.entries(WEIGHTS)) {
      const score = h2h.get(row.custId)?.[metric] ?? null;
      components[metric] = score == null ? null : round1(score);
      if (score == null) continue;   // no comparison — do not punish the gap
      sum += score * w;
      weight += w;
    }
    // The raw blended win rate — Colley ratings sit near 0.5, so even the best
    // driver lands in the 60s-70s. That is honest but reads as unflattering, so
    // it becomes the RANKING KEY and the published rating is stretched below.
    return { row, components, raw: weight ? sum / weight : null };
  });

  // Stretch the field's blended win rates onto the same 45-100 scale the rank
  // method uses: the strongest driver reads ~100, the weakest sits at the floor,
  // and Colley's ordering and relative gaps are preserved.
  const raws = rated.map((r) => r.raw).filter((v) => v != null);
  const lo = Math.min(...raws);
  const hi = Math.max(...raws);
  const stretch = (raw) => (raw == null ? RATING_FLOOR
    : round1(scaleRating(hi > lo ? ((raw - lo) / (hi - lo)) * 100 : 100)));

  const out = rated.map(({ row, components, raw }) => ({ ...row, components, rating: stretch(raw) }));
  out.sort((a, b) =>
    Number(a.provisional) - Number(b.provisional) ||
    b.rating - a.rating || b.points - a.points ||
    a.displayName.localeCompare(b.displayName));
  return out;
}

// Direct 1v1 records for the rivalry table. For every pair, count decisive
// head-to-head wins per metric (ties ignored) and how many races they shared.
// A driver's RIVAL is the most evenly split matchup with at least
// RIVAL_MIN_RACES shared races (relaxed for a driver who has raced fewer) — the
// opponent whose record is closest to 50/50, tie-broken by the most games
// traded. Every opponent's record is still returned so any driver can be
// picked. Returns
// Map custId -> { rival, opponents: [{ custId, displayName, meetings, record }] }
// where record is [{ metric, you, them }] from this driver's perspective.
export function rivalries(docs) {
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const names = new Map();
  const raceCount = new Map(); // custId -> races entered
  const pair = new Map(); // key -> { shared, metrics: { metric: { lo, hi } } }; lo = wins for the smaller id
  const rec = (k) => { let r = pair.get(k); if (!r) { r = { shared: 0, metrics: {} }; pair.set(k, r); } return r; };

  for (const d of docs) {
    for (const s of d.simsessions ?? []) for (const r of s.results ?? []) names.set(r.custId, r.displayName);
    // Shared races: every pair present together in the event's official sessions.
    const present = new Set();
    for (const s of d.simsessions ?? []) { if (!OFFICIAL.includes(s.kind)) continue; for (const r of s.results ?? []) present.add(r.custId); }
    for (const id of present) raceCount.set(id, (raceCount.get(id) ?? 0) + 1);
    const ids = [...present];
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) rec(key(ids[i], ids[j])).shared += 1;
    // Decisive wins per metric (a tie is a win for neither).
    eachMatchup(d, (metric, aId, bId, ox) => {
      if (ox === 0.5) return;
      const m = (rec(key(aId, bId)).metrics[metric] ??= { lo: 0, hi: 0 });
      const aIsLo = aId < bId;
      if (ox === 1) m[aIsLo ? 'lo' : 'hi'] += 1; else m[aIsLo ? 'hi' : 'lo'] += 1;
    });
  }

  // Index each driver's opponents, then choose the most evenly split as rival.
  const opponents = new Map();
  for (const [k, r] of pair) {
    const [a, b] = k.split('|').map(Number);
    if (!opponents.has(a)) opponents.set(a, new Map());
    if (!opponents.has(b)) opponents.set(b, new Map());
    opponents.get(a).set(b, r);
    opponents.get(b).set(a, r);
  }

  const metrics = Object.keys(WEIGHTS);
  // Record from `me`'s perspective vs opponent `opp`.
  const recordFor = (me, opp, r) => metrics.map((metric) => {
    const rm = r.metrics[metric] ?? { lo: 0, hi: 0 };
    return { metric, you: me < opp ? rm.lo : rm.hi, them: me < opp ? rm.hi : rm.lo };
  });

  const out = new Map();
  for (const [custId, opps] of opponents) {
    const list = [...opps].map(([oppId, r]) => {
      const record = recordFor(custId, oppId, r);
      const you = record.reduce((n, m) => n + m.you, 0);
      const them = record.reduce((n, m) => n + m.them, 0);
      return {
        custId: oppId, displayName: names.get(oppId) ?? `Driver ${oppId}`,
        meetings: r.shared, record, decisive: you + them, diff: Math.abs(you - them),
      };
    });
    // The rival is the most evenly split matchup: a decisive record first, then
    // the smallest win gap (closest to 50/50), tie-broken by the most games
    // traded. Ordered so the dropdown opens on the fiercest rivalry.
    list.sort((a, b) =>
      (b.decisive > 0) - (a.decisive > 0)
      || (a.decisive > 0 && b.decisive > 0 ? a.diff - b.diff : 0)
      || b.decisive - a.decisive
      || b.meetings - a.meetings
      || a.displayName.localeCompare(b.displayName));
    // A rival needs real history: at least RIVAL_MIN_RACES shared races — but a
    // driver who has raced fewer times than that can't clear the bar, so it
    // drops to their own race count. The list is sorted most-even first, so the
    // first eligible entry is the rival; every opponent is still exposed for the
    // dropdown.
    const threshold = Math.min(RIVAL_MIN_RACES, raceCount.get(custId) ?? 0);
    const rival = list.find((o) => o.meetings >= threshold)?.custId ?? null;
    out.set(custId, {
      rival,
      opponents: list.map(({ custId: id, displayName, meetings, record }) => ({ custId: id, displayName, meetings, record })),
    });
  }
  return out;
}

// The race-by-race head-to-head between two drivers: every event they shared,
// with each one's overall placing and who finished ahead. Surfaces the concrete
// results behind the aggregate record.
export async function computeMatchup(db, aId, bId) {
  const docs = await collections(db).subsessions
    .find({ 'simsessions.results.custId': { $all: [aId, bId] } }, { projection: { raw: 0 } })
    .sort({ startTime: 1 }).toArray();
  const names = new Map();
  const events = [];
  for (const d of docs) {
    for (const s of d.simsessions ?? []) for (const r of s.results ?? []) names.set(r.custId, r.displayName);
    const order = overallOrder(d);
    if (!order) continue;
    const aPos = order.indexOf(aId);
    const bPos = order.indexOf(bId);
    if (aPos < 0 || bPos < 0) continue; // both must be classified overall
    events.push({
      startTime: d.startTime ?? null,
      track: d.track?.name ?? null,
      aOverall: aPos + 1,
      bOverall: bPos + 1,
      aAhead: aPos < bPos,
    });
  }
  return {
    a: { custId: aId, displayName: names.get(aId) ?? `Driver ${aId}` },
    b: { custId: bId, displayName: names.get(bId) ?? `Driver ${bId}` },
    events,
  };
}

export async function computeRivals(db, { seriesSlug = null } = {}) {
  const match = seriesSlug ? { seriesSlug } : {};
  const docs = await collections(db).subsessions.find(match, { projection: { raw: 0 } }).toArray();
  const map = rivalries(docs);
  const rivals = [...map].map(([custId, v]) => ({ custId, ...v }));

  // Every driver's display name (as it appears in the opponent records).
  const names = new Map();
  for (const [, v] of map) for (const o of v.opponents) names.set(o.custId, o.displayName);

  // The fiercest rivalry in the field: most evenly split, with a decisive record
  // and at least RIVAL_MIN_RACES shared races; ties go to the most games, then
  // the most meetings.
  let best = null;
  const seen = new Set();
  for (const [custId, v] of map) {
    for (const o of v.opponents) {
      const k = custId < o.custId ? `${custId}|${o.custId}` : `${o.custId}|${custId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (o.meetings < RIVAL_MIN_RACES) continue;
      const you = o.record.reduce((n, m) => n + m.you, 0);
      const them = o.record.reduce((n, m) => n + m.them, 0);
      if (you + them === 0) continue;
      const cand = { a: custId, b: o.custId, meetings: o.meetings, record: o.record, diff: Math.abs(you - them), decisive: you + them };
      if (!best || cand.diff < best.diff
        || (cand.diff === best.diff && cand.decisive > best.decisive)
        || (cand.diff === best.diff && cand.decisive === best.decisive && cand.meetings > best.meetings)) best = cand;
    }
  }
  const featured = best ? {
    a: { custId: best.a, displayName: names.get(best.a) ?? `Driver ${best.a}` },
    b: { custId: best.b, displayName: names.get(best.b) ?? `Driver ${best.b}` },
    meetings: best.meetings, record: best.record,
  } : null;

  return { rivals, featured };
}

// Attach `change` to each driver: how far they rose (+) or fell (−) in position
// versus a prior ranking. Only ranked (non-provisional) drivers are compared; a
// driver not ranked before — or provisional now — gets null.
export function attachPositionChanges(drivers, prior) {
  const prevPos = new Map();
  prior.filter((d) => !d.provisional).forEach((d, i) => prevPos.set(d.custId, i + 1));
  drivers.forEach((d, i) => {
    if (d.provisional) { d.change = null; return; }
    const before = prevPos.get(d.custId);
    d.change = before == null ? null : before - (i + 1);
  });
  return drivers;
}

export async function computePowerRanking(db, { seriesSlug = null, minEvents = MIN_EVENTS } = {}) {
  const match = seriesSlug ? { seriesSlug } : {};
  const docs = await collections(db).subsessions.find(match, { projection: { raw: 0 } }).toArray();
  const drivers = computeHeadToHead(docs, { minEvents });

  // Position change since the last event: re-rank without the most recent event.
  const times = docs.map((d) => new Date(d.startTime ?? 0).getTime());
  const lastTime = times.length ? Math.max(...times) : null;
  const prior = lastTime == null ? [] : docs.filter((d) => new Date(d.startTime ?? 0).getTime() < lastTime);
  attachPositionChanges(drivers, prior.length ? computeHeadToHead(prior, { minEvents }) : []);

  return { minEvents, weights: WEIGHTS, drivers };
}
