import { collections } from '../db/index.js';

// iRacing's track catalog, one document per track with every current layout
// it has, taken from Sim Racer Hub's configuration table. Retired tracks and
// layouts are left out: nobody can schedule them. The club uses it when
// drafting next season's schedule: the type and length of each layout decide
// whether a pick counts as a road course, and the short names are what the
// scoring page calls the layouts.
export const SOURCE_URL = 'https://www.simracerhub.com/scoring/configs.php';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', eacute: 'é', oacute: 'ó', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', ccedil: 'ç' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
const text = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// SRH marks retired layouts with a "[Retired]" (or "[Ret]") tag, usually as a
// prefix on the track or config name but sometimes only inside the short name.
const RETIRED = /\[(?:Retired|Ret)\]/i;
const isRetired = (...names) => names.some((n) => n && RETIRED.test(n));

/**
 * Pull the configuration rows out of the SRH page. Each row is one layout:
 * Track · Config · Short Name · Free · Length (mi) · Turns · Type · Night ·
 * scheduled races · races run. The last two are SRH usage counts and are
 * dropped. Pure, so the scrape is testable against a snippet.
 */
export function parseConfigsPage(html) {
  const rows = [];
  const rowRe = /<tr class='jsTableRow' id='cfg_(\d+)'>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
    if (cells.length < 8) continue;
    const [track, config, shortName, free, length, turns, type, night] = cells;
    rows.push({
      srhConfigId: Number(m[1]),
      track,
      // SRH leaves the config blank when a track has a single layout.
      config: config || null,
      shortName,
      type,
      lengthMi: length === '' ? null : Number(length),
      turns: turns === '' ? null : Number(turns),
      free: free === 'Yes',
      night: night === 'Yes',
    });
  }
  return rows;
}

/**
 * Fold layout rows into one document per track, layouts in page order,
 * skipping retired tracks and layouts.
 */
export function groupTracks(rows) {
  const byTrack = new Map();
  for (const r of rows) {
    if (isRetired(r.track, r.config, r.shortName)) continue;
    const key = slugify(r.track);
    if (!byTrack.has(key)) byTrack.set(key, { _id: key, name: r.track, configs: [] });
    byTrack.get(key).configs.push({
      srhConfigId: r.srhConfigId,
      name: r.config,
      shortName: r.shortName,
      type: r.type,
      lengthMi: r.lengthMi,
      turns: r.turns,
      free: r.free,
      night: r.night,
    });
  }
  return [...byTrack.values()];
}

/**
 * Replace the catalog with what the page says now. Upserts by track slug and
 * removes tracks the page no longer lists, so a re-run converges on the source.
 */
export async function importTracks(db, html, { now = new Date() } = {}) {
  const docs = groupTracks(parseConfigsPage(html));
  if (!docs.length) throw new Error('No track configurations found in the page.');
  const { tracks } = collections(db);
  await tracks.bulkWrite(docs.map((d) => ({
    replaceOne: { filter: { _id: d._id }, replacement: { ...d, source: SOURCE_URL, importedAt: now }, upsert: true },
  })));
  const { deletedCount } = await tracks.deleteMany({ _id: { $nin: docs.map((d) => d._id) } });
  return { tracks: docs.length, configs: docs.reduce((n, d) => n + d.configs.length, 0), removed: deletedCount };
}

export async function fetchConfigsPage(fetchFn = fetch) {
  const res = await fetchFn(SOURCE_URL, { headers: { 'user-agent': 'analogracingclub.com track import' } });
  if (!res.ok) throw new Error(`${SOURCE_URL} answered ${res.status}`);
  return res.text();
}

/** Every track, alphabetical. */
export async function getTracks(db) {
  const { tracks } = collections(db);
  return tracks.find().sort({ name: 1 }).toArray();
}
