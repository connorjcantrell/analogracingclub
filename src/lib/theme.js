// Light or dark by the clock: light through the day, dark through the
// evening and night, on the device's local time. The header switch overrides
// that until the clock would next flip, so a late-night switch to light lasts
// until morning and then the schedule resumes. app.html carries a copy of
// this logic inline so the first paint is already the right theme.
export const DAY_START = 7; // 07:00 local: light
export const DAY_END = 19; // 19:00 local: dark
const KEY = 'theme-override';

export const isDay = (d = new Date()) => d.getHours() >= DAY_START && d.getHours() < DAY_END;
export const clockTheme = (d = new Date()) => (isDay(d) ? 'light' : 'dark');

// When the clock next flips, as a timestamp.
export function nextFlip(d = new Date()) {
  const at = new Date(d);
  at.setMinutes(0, 0, 0);
  if (d.getHours() < DAY_START) at.setHours(DAY_START);
  else if (d.getHours() < DAY_END) at.setHours(DAY_END);
  else { at.setDate(at.getDate() + 1); at.setHours(DAY_START); }
  return at.getTime();
}

// The theme in force: an unexpired override, else the clock's.
export function currentTheme() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (o && (o.theme === 'light' || o.theme === 'dark') && Date.now() < o.until) return o.theme;
    localStorage.removeItem(KEY);
  } catch {}
  return clockTheme();
}

export function override(theme) {
  try { localStorage.setItem(KEY, JSON.stringify({ theme, until: nextFlip() })); } catch {}
}

export function apply(theme) {
  document.documentElement.dataset.theme = theme;
}
