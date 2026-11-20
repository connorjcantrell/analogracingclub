import { collections } from '../db/index.js';
import { buildSubsessionDocument } from '../import/build-document.js';
import { DEFAULT_POINTS_CONFIG } from './config.js';
import { pointsConfigFor } from './formats.js';
import { listSeasons, stakeSeasonFor } from '../season.js';

// Rebuild a series' subsessions (or all) from their stored raw event JSON with
// the series' current pointsConfig. Run after a points config changes. A
// single session rebuilds under its own stored format instead.
export async function rescore(db, { seriesSlug = null } = {}) {
  const { subsessions, series } = collections(db);
  const match = seriesSlug == null ? {} : { seriesSlug };
  const cache = new Map();
  const seriesFor = async (slug) => {
    if (!cache.has(slug)) cache.set(slug, slug ? await series.findOne({ slug }) : null);
    return cache.get(slug);
  };
  const seasons = await listSeasons(db);
  let updated = 0;
  for await (const doc of subsessions.find(match)) {
    if (!doc.raw) continue;
    const s = await seriesFor(doc.seriesSlug);
    const format = doc.seriesSlug ? null : (doc.format ?? 'unscored');
    const rebuilt = buildSubsessionDocument(doc.raw, {
      seriesSlug: doc.seriesSlug, round: doc.round, rawType: doc.rawType, format, stakeExcluded: doc.stakeExcluded === true,
      pointsConfig: doc.seriesSlug ? (s?.pointsConfig ?? DEFAULT_POINTS_CONFIG) : (doc.pointsConfig ?? pointsConfigFor(format)),
      // A league round carries its container's type; a special keeps its own.
      eventType: doc.seriesSlug ? (s?.eventType ?? doc.eventType) : doc.eventType,
      title: doc.title,
    });
    // Photos are curated in the admin, not derived from the result JSON, so
    // they must survive a rebuild.
    for (const k of ['images', 'featuredImage', 'postTitle', 'postBody']) if (doc[k]) rebuilt[k] = doc[k];
    rebuilt.stakeSeason = stakeSeasonFor(seasons, rebuilt);
    await subsessions.replaceOne({ _id: doc._id }, rebuilt);
    updated += 1;
  }
  return { updated };
}
