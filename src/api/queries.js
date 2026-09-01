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

export async function getSubsession(db, id) {
  return collections(db).subsessions.findOne({ _id: id }, { projection: { raw: 0 } });
}

// The stored event JSON, reconstructed as the original upload envelope.
export async function getSubsessionRaw(db, id) {
  const doc = await collections(db).subsessions.findOne({ _id: id }, { projection: { raw: 1, rawType: 1 } });
  if (!doc?.raw) return null;
  return { type: doc.rawType ?? 'event_result', data: doc.raw };
}
