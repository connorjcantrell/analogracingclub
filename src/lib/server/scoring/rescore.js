import { collections } from '../db/index.js';
import { buildSubsessionDocument } from '../import/build-document.js';
import { DEFAULT_POINTS_CONFIG } from './config.js';

// Rebuild a series' subsessions (or all) from their stored raw event JSON with
// the series' current pointsConfig. Run after a points config changes.
export async function rescore(db, { seriesSlug = null } = {}) {
  const { subsessions, series } = collections(db);
  const match = seriesSlug == null ? {} : { seriesSlug };
  const cache = new Map();
  const seriesFor = async (slug) => {
    if (!cache.has(slug)) cache.set(slug, slug ? await series.findOne({ slug }) : null);
    return cache.get(slug);
  };
  let updated = 0;
  for await (const doc of subsessions.find(match)) {
    if (!doc.raw) continue;
    const s = await seriesFor(doc.seriesSlug);
    const rebuilt = buildSubsessionDocument(doc.raw, {
      seriesSlug: doc.seriesSlug, round: doc.round, rawType: doc.rawType,
      pointsConfig: s?.pointsConfig ?? DEFAULT_POINTS_CONFIG,
      // A league round carries its container's type; a special keeps its own.
      eventType: doc.seriesSlug ? (s?.eventType ?? doc.eventType) : doc.eventType,
      title: doc.title,
    });
    // Photos are curated in the admin, not derived from the result JSON, so
    // they must survive a rebuild.
    if (doc.images) rebuilt.images = doc.images;
    if (doc.featuredImage) rebuilt.featuredImage = doc.featuredImage;
    await subsessions.replaceOne({ _id: doc._id }, rebuilt);
    updated += 1;
  }
  return { updated };
}
