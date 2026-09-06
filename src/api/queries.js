import { collections } from '../db/index.js';

const PUBLIC_SERIES = { _id: 0 };

// Public series list, active first, then upcoming, then complete; newest first
// within a group.
export async function listSeries(db, { status = null } = {}) {
  const match = status ? { status } : {};
  const rows = await collections(db).series.find(match, { projection: PUBLIC_SERIES }).toArray();
  const order = { active: 0, upcoming: 1, complete: 2 };
  return rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
}

export async function getSeries(db, slug) {
  return collections(db).series.findOne({ slug }, { projection: PUBLIC_SERIES });
}

export async function listDrivers(db) {
  return collections(db)
    .drivers.find({}, { projection: { custId: '$_id', displayName: 1, _id: 0 } })
    .sort({ displayName: 1 })
    .toArray();
}

// Stored results: summary only (no raw, no per-driver rows).
export async function listSubsessions(db, { seriesSlug = null } = {}) {
  const match = seriesSlug == null ? {} : { seriesSlug };
  return collections(db)
    .subsessions.find(match, { projection: { raw: 0, 'simsessions.results': 0 } })
    .sort({ seriesSlug: 1, round: 1, startTime: 1 })
    .toArray();
}

// Full result docs (minus raw) for a series, for the results page.
export async function listSubsessionsFull(db, { seriesSlug }) {
  return collections(db)
    .subsessions.find({ seriesSlug }, { projection: { raw: 0 } })
    .sort({ round: 1, startTime: 1 })
    .toArray();
}

// Standalone special events (no series), newest first — full docs minus raw.
export async function listSpecialEvents(db) {
  return collections(db)
    .subsessions.find({ seriesSlug: null }, { projection: { raw: 0 } })
    .sort({ startTime: -1 })
    .toArray();
}

export async function getSubsession(db, id) {
  return collections(db).subsessions.findOne({ _id: id }, { projection: { raw: 0 } });
}

// Flatten stored subsession docs into a photo collection, each photo carrying
// its event's track and date for captions. Pure so it can be unit-tested;
// input order is preserved, so callers sort the rows first.
export function photosFrom(rows, { limit = 40 } = {}) {
  const photos = [];
  for (const s of rows) {
    for (const img of s.images ?? []) {
      photos.push({
        url: img.url,
        track: s.track?.name ?? null,
        config: s.track?.config ?? null,
        startTime: s.startTime ?? null,
        seriesSlug: s.seriesSlug ?? null,
        round: s.round ?? null,
        featured: img.url === s.featuredImage,
      });
    }
  }
  return photos.slice(0, Math.max(0, limit));
}

// Every uploaded race photo across all events, newest event first. Powers the
// homepage carousel, which is simply the collection of photos attached to
// results.
export async function listPhotos(db, { limit = 40 } = {}) {
  const rows = await collections(db)
    .subsessions.find(
      { 'images.0': { $exists: true } },
      { projection: { images: 1, featuredImage: 1, track: 1, startTime: 1, seriesSlug: 1, round: 1 } })
    .sort({ startTime: -1 })
    .toArray();
  return photosFrom(rows, { limit });
}

// The stored event JSON, reconstructed as the original upload envelope.
export async function getSubsessionRaw(db, id) {
  const doc = await collections(db).subsessions.findOne({ _id: id }, { projection: { raw: 1, rawType: 1 } });
  if (!doc?.raw) return null;
  return { type: doc.rawType ?? 'event_result', data: doc.raw };
}
