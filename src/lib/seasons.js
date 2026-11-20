// Seasons as windows of time. A season has a start and an optional end; with
// no end it runs until the next season starts. Pure helpers shared by the
// server (filing sessions into seasons, see server/season.js) and the admin
// page (the hint under the upload form). Dates may be Date objects or ISO
// strings.

const ms = (d) => (d == null ? null : new Date(d).getTime());

/** Seasons in start order, each with the end its window actually has. */
export function seasonWindows(seasons) {
  const sorted = [...seasons].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  return sorted.map((s, i) => ({ ...s, endsAtEffective: s.endsAt ?? sorted[i + 1]?.startsAt ?? null }));
}

/** The season whose window holds the instant `at`, or null. */
export function seasonAt(seasons, at = new Date()) {
  const t = ms(at);
  if (t == null || Number.isNaN(t)) return null;
  return seasonWindows(seasons).find((s) => ms(s.startsAt) <= t && (s.endsAtEffective == null || t < ms(s.endsAtEffective))) ?? null;
}

/**
 * Why `candidate` cannot sit among `others` (which may hold an earlier
 * version of it, matched on slug), or null when it can: windows never
 * overlap, so at most one season is current at any instant.
 */
export function seasonConflict(candidate, others) {
  const start = ms(candidate.startsAt), end = ms(candidate.endsAt);
  if (start == null || Number.isNaN(start)) return 'A season needs a start date.';
  if (end != null && !(end > start)) return 'The end date must be after the start date.';
  const all = [...others.filter((s) => s.slug !== candidate.slug), candidate];
  const w = seasonWindows(all);
  for (let i = 1; i < w.length; i += 1) {
    const prev = w[i - 1], next = w[i];
    if (ms(prev.startsAt) === ms(next.startsAt)) return `${prev.name} and ${next.name} would start on the same day.`;
    if (prev.endsAt != null && ms(prev.endsAt) > ms(next.startsAt)) return `${prev.name} would still be running when ${next.name} starts.`;
  }
  return null;
}
