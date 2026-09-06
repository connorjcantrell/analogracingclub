// Shared frontend helpers.
export const api = (path) => fetch(path).then((r) => r.json());
export const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) node.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ''));
  return node;
};
// iRacing display names carry a numeric duplicate-name suffix ("Andrew
// Bowman4") — strip it for display; stored data keeps the real name.
export const driverName = (n) => String(n ?? '').replace(/\d+$/, '').trim();
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
// iRacing reports "N/A" as the config for tracks with a single layout.
const realConfig = (c) => (c && !/^n\/?a$/i.test(c.trim()) ? c : null);
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
  for (const s of sub.simsessions ?? []) {
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

// The sentinel a picker uses for the single "Special events" collection.
export const SPECIAL_SLUG = '__special__';

// Series picker for the standings/results pages. Containers (leagues/
// championships) are the real series; standalone special events are collapsed
// into one "Special events" entry (results only — they have no standings).
// ?series= wins, else the first active series. Renders a <select> when there is
// more than one choice.
export async function pickSeries(mount, onChange, { includeSpecial = true } = {}) {
  const containers = await api('/api/series');
  const specials = includeSpecial ? await api('/api/special-events') : [];
  const hasSpecial = specials.length > 0;
  const values = [...containers.map((s) => s.slug), ...(hasSpecial ? [SPECIAL_SLUG] : [])];
  if (!values.length) return null;
  const want = new URLSearchParams(location.search).get('series');
  const pick = values.includes(want) ? want
    : (containers.find((s) => s.status === 'active') ?? containers[0])?.slug ?? SPECIAL_SLUG;
  if (values.length > 1) {
    const sel = el('select', { class: 'series-pick' });
    for (const s of containers) sel.append(el('option', { value: s.slug }, `${s.name} · ${s.typeLabel}${s.status !== 'active' ? ` (${s.status})` : ''}`));
    if (hasSpecial) sel.append(el('option', { value: SPECIAL_SLUG }, 'Special events'));
    sel.value = pick;
    sel.addEventListener('change', () => {
      history.replaceState(null, '', `?series=${encodeURIComponent(sel.value)}`);
      onChange(sel.value);
    });
    mount.append(sel);
  }
  return pick;
}

// Gallery of race photos with a click-to-enlarge lightbox. Returns null when
// the subsession has no images, so callers can leave the section hidden.
export function gallery(sub) {
  const images = sub?.images ?? [];
  if (!images.length) return null;

  const figures = images.map((img, i) => {
    const thumb = el('img', { src: img.url, alt: img.name ?? `Race photo ${i + 1}`, loading: 'lazy' });
    const button = el('button', { class: 'shot', type: 'button', 'aria-label': `Enlarge ${img.name ?? `photo ${i + 1}`}` }, thumb);
    button.addEventListener('click', () => open(i));
    return button;
  });

  let current = 0;
  const full = el('img', { class: 'lightbox-img', alt: '' });
  const caption = el('p', { class: 'lightbox-caption' });
  const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', hidden: 'hidden' },
    el('button', { class: 'lightbox-close', type: 'button', 'aria-label': 'Close' }, '×'),
    el('button', { class: 'lightbox-nav prev', type: 'button', 'aria-label': 'Previous' }, '‹'),
    full,
    el('button', { class: 'lightbox-nav next', type: 'button', 'aria-label': 'Next' }, '›'),
    caption);

  function show(i) {
    current = (i + images.length) % images.length;
    full.src = images[current].url;
    caption.textContent = `${current + 1} / ${images.length}`;
  }
  function open(i) { show(i); box.hidden = false; document.body.style.overflow = 'hidden'; }
  function close() { box.hidden = true; full.src = ''; document.body.style.overflow = ''; }

  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.querySelector('.prev').addEventListener('click', () => show(current - 1));
  box.querySelector('.next').addEventListener('click', () => show(current + 1));
  // Click the backdrop (but not the image or controls) to dismiss.
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
  });

  return el('div', { class: 'gallery-wrap' }, el('div', { class: 'gallery' }, ...figures), box);
}
