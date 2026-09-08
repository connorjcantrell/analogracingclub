import { MongoClient } from 'mongodb';
import { MONGO_URL, MONGO_DB } from '../config.js';

let _client = null;
let _db = null;

/** Connect (once) and return the database handle, ensuring indexes exist. */
export async function getDb() {
  if (_db) return _db;
  _client = new MongoClient(MONGO_URL);
  await _client.connect();
  _db = _client.db(MONGO_DB);
  await ensureIndexes(_db);
  await backfillEventTypes(_db);
  return _db;
}

// Rounds ingested before event types existed have no `eventType`; stamp each
// with its series' type so they render (Heat tab, cards) like newer rounds.
// Idempotent — a no-op once every round is stamped.
async function backfillEventTypes(db) {
  const { series, subsessions } = collections(db);
  for await (const s of series.find({}, { projection: { slug: 1, eventType: 1 } })) {
    if (!s.eventType) continue;
    const r = await subsessions.updateMany({ seriesSlug: s.slug, eventType: null }, { $set: { eventType: s.eventType } });
    if (r.modifiedCount) console.log(`backfilled eventType=${s.eventType} on ${r.modifiedCount} round(s) of ${s.slug}`);
  }
}

/** Collection accessors. */
export const collections = (db) => ({
  // A series is any competition (see src/event-types.js for its event type,
  // which sets structure + layout). Several can be active at once; each has its
  // own points format.
  series: db.collection('series'),
  drivers: db.collection('drivers'),
  subsessions: db.collection('subsessions'),
  // Authored homepage posts (currently schedule announcements). Results posts
  // are derived from subsessions on the fly, so only authored content lives here.
  posts: db.collection('posts'),
});

async function ensureIndexes(db) {
  const { series, subsessions, posts } = collections(db);
  // _id on subsessions is `<seriesSlug>:<subsession_id>`; _id on drivers is cust_id.
  await subsessions.createIndex({ seriesSlug: 1, round: 1 });
  await series.createIndex({ slug: 1 }, { unique: true });
  await series.createIndex({ status: 1, eventType: 1 });
  // The feed reads authored posts newest-first, merged with subsessions.
  await posts.createIndex({ publishedAt: -1 });
}

export async function closeDb() {
  if (_client) await _client.close();
  _client = null;
  _db = null;
}
