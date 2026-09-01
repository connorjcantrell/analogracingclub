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
export const trackName = (sub) => [sub?.track?.name, sub?.track?.config].filter(Boolean).join(' — ');

export const session = (sub, kind) => (sub?.simsessions ?? []).find((s) => s.kind === kind);
export const winner = (sub, kind) => driverName(session(sub, kind)?.results?.find((r) => r.finish === 1)?.displayName);

// Per-driver round summary from one subsession: { name, qualifying, sprint,
// feature, total }, ordered by feature finish.
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
    (a.feature?.finish ?? Infinity) - (b.feature?.finish ?? Infinity) || b.total - a.total);
};

// Series picker for the standings/results pages: ?series= wins, else the first
// active series. Renders a <select> into `mount` when there is more than one.
export async function pickSeries(mount, onChange) {
  const list = await api('/api/series');
  if (!list.length) return null;
  const want = new URLSearchParams(location.search).get('series');
  let slug = list.some((s) => s.slug === want) ? want : (list.find((s) => s.status === 'active') ?? list[0]).slug;
  if (list.length > 1) {
    const sel = el('select', { class: 'series-pick' });
    for (const s of list) sel.append(el('option', { value: s.slug }, `${s.name} · ${s.typeLabel}${s.status !== 'active' ? ` (${s.status})` : ''}`));
    sel.value = slug;
    sel.addEventListener('change', () => {
      history.replaceState(null, '', `?series=${encodeURIComponent(sel.value)}`);
      onChange(sel.value);
    });
    mount.append(sel);
  }
  return slug;
}
