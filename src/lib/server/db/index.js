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
  // YouTube channels the admin follows, and the uploads from them that name
  // the club (see src/lib/server/videos). _id is the channel / video id.
  channels: db.collection('channels'),
  videos: db.collection('videos'),
  // Next-season car vote (see src/lib/server/vote). voteSessions holds the
  // ballot definition (cars, window, points-source series); voteCodes holds
  // each driver's sign-in passcode (_id is custId, generated on /admin/vote
  // and handed out by DM); voteBallots is one doc per driver per session with
  // their point allocation.
  voteSessions: db.collection('voteSessions'),
  voteCodes: db.collection('voteCodes'),
  voteBallots: db.collection('voteBallots'),
  // iRacing's track catalog (see src/lib/server/tracks): one doc per track,
  // _id its slug, with every layout's type, length, turns and short name.
  // Loaded from Sim Racer Hub by `npm run tracks`.
  tracks: db.collection('tracks'),
  // Next season's track selection (see src/lib/server/track-selection):
  // trackSelections names the drivers who pick and the allowed track types;
  // trackPicks is one doc per driver per selection with their round.
  trackSelections: db.collection('trackSelections'),
  trackPicks: db.collection('trackPicks'),
});

async function ensureIndexes(db) {
  const { series, subsessions, posts, videos, voteBallots, trackPicks } = collections(db);
  // The live tally re-reads a session's ballots every few seconds.
  await voteBallots.createIndex({ sessionId: 1 });
  // One track per selection, whatever the layout (see track-selection/savePick).
  await trackPicks.createIndex({ selectionId: 1, trackId: 1 }, { unique: true });
  // _id on subsessions is `<seriesSlug>:<subsession_id>`; _id on drivers is cust_id.
  await subsessions.createIndex({ seriesSlug: 1, round: 1 });
  await series.createIndex({ slug: 1 }, { unique: true });
  await series.createIndex({ status: 1, eventType: 1 });
  // The feed reads authored posts newest-first, merged with subsessions.
  await posts.createIndex({ publishedAt: -1 });
  await videos.createIndex({ publishedAt: -1 });
  await videos.createIndex({ channelId: 1 });
}

export async function closeDb() {
  if (_client) await _client.close();
  _client = null;
  _db = null;
}
