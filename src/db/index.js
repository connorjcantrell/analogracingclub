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
  return _db;
}

/** Collection accessors. */
export const collections = (db) => ({
  // A series is any competition (see src/event-types.js for its event type,
  // which sets structure + layout). Several can be active at once; each has its
  // own points format.
  series: db.collection('series'),
  drivers: db.collection('drivers'),
  subsessions: db.collection('subsessions'),
});

async function ensureIndexes(db) {
  const { series, subsessions } = collections(db);
  // _id on subsessions is `<seriesSlug>:<subsession_id>`; _id on drivers is cust_id.
  await subsessions.createIndex({ seriesSlug: 1, round: 1 });
  await series.createIndex({ slug: 1 }, { unique: true });
  await series.createIndex({ status: 1, eventType: 1 });
}

export async function closeDb() {
  if (_client) await _client.close();
  _client = null;
  _db = null;
}
