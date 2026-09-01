import { collections } from '../db/index.js';
import { buildSubsessionDocument } from '../import/build-document.js';
import { DEFAULT_POINTS_CONFIG } from './config.js';

// Rebuild a series' subsessions (or all) from their stored raw event JSON with
// the series' current pointsConfig. Run after a points config changes.
export async function rescore(db, { seriesSlug = null } = {}) {
  const { subsessions, series } = collections(db);
  const match = seriesSlug == null ? {} : { seriesSlug };
  const cache = new Map();
  const configFor = async (slug) => {
    if (!cache.has(slug)) {
      const s = slug ? await series.findOne({ slug }) : null;
      cache.set(slug, s?.pointsConfig ?? DEFAULT_POINTS_CONFIG);
    }
    return cache.get(slug);
  };
  let updated = 0;
  for await (const doc of subsessions.find(match)) {
    if (!doc.raw) continue;
    const rebuilt = buildSubsessionDocument(doc.raw, {
      seriesSlug: doc.seriesSlug, round: doc.round, pointsConfig: await configFor(doc.seriesSlug), rawType: doc.rawType,
    });
    await subsessions.replaceOne({ _id: doc._id }, rebuilt);
    updated += 1;
  }
  return { updated };
}
