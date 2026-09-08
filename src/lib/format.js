// Pure formatting and result-shaping helpers (no DOM), shared by the pages.

// iRacing display names carry a numeric duplicate-name suffix ("Andrew
// Bowman4") — strip it for display; stored data keeps the real name.
export const driverName = (n) => String(n ?? '').replace(/\d+$/, '').trim();
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
// iRacing reports "N/A" as the config for tracks with a single layout.
export const realConfig = (c) => (c && !/^n\/?a$/i.test(c.trim()) ? c : null);
export const trackName = (sub) =>
  [sub?.track?.name, realConfig(sub?.track?.config)].filter(Boolean).join(' — ');

// iRacing reports times in 10,000ths of a second.
const TICKS = 10_000;

// A lap time as m:ss.mmm (or ss.mmm under a minute).
export const lapTime = (ticks) => {
  if (ticks == null || ticks <= 0) return null;
  const s = ticks / TICKS;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(3).padStart(6, '0');
  return m ? `${m}:${rest}` : rest.replace(/^0/, '');
};

// A gap behind the leader as +s.mmm (or +m:ss.mmm past a minute).
export const gap = (ticks) => {
  if (ticks == null || ticks <= 0) return null;
  return `+${lapTime(ticks)}`;
};

// An elapsed race time as m:ss (or h:mm:ss past an hour), rounded to the second.
// Used for a winner's total time, which iRacing gives only as a derived figure
// (no absolute finish time is stored), so sub-second precision would be false.
export const duration = (ticks) => {
  if (ticks == null || ticks <= 0) return null;
  const total = Math.round(ticks / TICKS);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// A schedule round's start, stored as a local wall-clock "YYYY-MM-DDTHH:mm"
// with no zone: rendered from its own parts (via UTC so no conversion sneaks
// in), e.g. "Thu Sep 17, 7:30 PM". Same output on the server and in every browser.
export const fmtStartTime = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// 1 → 1st, 2 → 2nd, 3 → 3rd …
export const ordinal = (n) => { const t = n % 100; return `${n}${(t >= 11 && t <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')}`; };

export const session = (sub, kind) => (sub?.simsessions ?? []).find((s) => s.kind === kind);
export const winner = (sub, kind) => driverName(session(sub, kind)?.results?.find((r) => r.finish === 1)?.displayName);

// What an event looks like is declared by its own event type (see
// src/event-types.js), read off the event the API sends — each subsession
// carries an `eventType` descriptor with `sessions` (ordered { kind, label }).
// The pages render strictly from it: a declared session shows its tab/column
// even when a round skipped it, and an undeclared one never appears.
export const eventSessions = (et) => et?.sessions ?? [];
export const sessionKindsOf = (et) => eventSessions(et).map((s) => s.kind);
export const sessionLabel = (et, kind) =>
  eventSessions(et).find((s) => s.kind === kind)?.label ?? kind;
// The race sessions an event runs (everything but qualifying/practice), in order.
export const raceSessions = (et) =>
  eventSessions(et).filter((s) => s.kind !== 'qualifying' && s.kind !== 'practice');
export const cardsOf = (et) => et?.display?.cards ?? [];

// The scoring qualifiers, in qualifying order. "Fast Four" is a points-format
// convention, not something the session itself implies: the ARC standard pays
// the top four, so those four are worth naming. A format that scores no
// qualifying places (a special event, say) has none, and `places` of 0 gives
// an empty list rather than an invented top four.
export const topQualifiers = (sub, places) => (places > 0
  ? (session(sub, 'qualifying')?.results ?? [])
    .filter((r) => r.finish >= 1 && r.finish <= places)
    .sort((a, b) => a.finish - b.finish)
    .map((r) => ({ finish: r.finish, name: driverName(r.displayName) }))
  : []);

// Per-driver round summary from one subsession: { name, qualifying, sprint,
// feature, total }, ordered by total points earned.
export const roundTable = (sub) => {
  const perDriver = new Map();
  for (const s of sub?.simsessions ?? []) {
    if (s.kind === 'practice') continue;
    for (const x of s.results) {
      const d = perDriver.get(x.custId) ?? { custId: x.custId, name: x.displayName, total: 0 };
      d[s.kind] = x;
      d.total += x.points.total;
      perDriver.set(x.custId, d);
    }
  }
  return [...perDriver.values()].sort((a, b) =>
    b.total - a.total || (a.feature?.finish ?? Infinity) - (b.feature?.finish ?? Infinity));
};
// Winner on points across the round — the top of the Overall tab.
export const overallWinner = (sub) => (sub ? driverName(roundTable(sub)[0]?.name) : null);

// A driver's finishing position in one session, for the Overall grid.
export const posCell = (x) => (x?.finish ? `P${x.finish}` : '—');

// Net positions gained across a round (from a roundTable row): the heat grid
// slot (or the feature grid, with no heat) to the feature finish. Positive is
// places gained; null when the driver didn't run the deciding race.
export const roundPositionsGained = (d) => {
  const finish = d?.feature?.finish ?? null;
  const start = d?.sprint?.start ?? d?.feature?.start ?? null;
  return start == null || finish == null ? null : start - finish;
};

// A signed count for display: +3, −2, 0, or — when absent.
export const signed = (n) => (n == null ? '—' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// Session-specific columns for a session table. Qualifying compares lap times
// against pole (derived from stored times, so it works without the `interval`
// older results lack); races show the grid slot, laps led and the gap at the
// flag (a stored interval, or laps down for older results).
const qualGap = (rows, x) => {
  const pole = rows.find((r) => r.finish === 1)?.bestLapTime;
  if (!pole || !x.bestLapTime) return null;
  return x.bestLapTime - pole;
};
const raceBehind = (rows, x) => {
  if (x.finish === 1) return null;
  if (x.interval != null) return gap(x.interval);
  const lead = rows.find((r) => r.finish === 1);
  const down = (lead?.lapsComplete ?? 0) - (x.lapsComplete ?? 0);
  return down > 0 ? `${down} lap${down > 1 ? 's' : ''}` : null;
};
const RACE_COLS = [
  { head: 'Start', cell: (x) => (x.start ? `P${x.start}` : null) },
  { head: 'Laps led', cell: (x) => (x.lapsLead ? String(x.lapsLead) : null) },
  { head: 'Behind', cell: (x, rows) => raceBehind(rows, x) },
  { head: 'Best lap', cell: (x) => lapTime(x.bestLapTime) },
];
export const SESSION_COLS = {
  qualifying: [
    { head: 'Time / gap', cell: (x, rows) => {
      if (x.finish === 1) return lapTime(x.bestLapTime);
      const d = qualGap(rows, x);
      return d == null ? null : (d > 0 ? gap(d) : lapTime(x.bestLapTime));
    } },
  ],
  sprint: RACE_COLS,
  feature: RACE_COLS,
};

// The sentinel a picker uses for the single "Special events" collection.
export const SPECIAL_SLUG = '__special__';
