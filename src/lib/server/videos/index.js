// Race videos from YouTube. The admin keeps a list of channels; a poller
// reads each channel's feed and stores every upload that mentions the club
// by name. Nothing is matched to a race at that point — a video belongs to
// whichever stored race was the latest to start before it was published,
// and that is worked out when read (see assignVideos), so results uploaded
// after the video appeared still claim it.
import { collections } from '../db/index.js';
import { fetchChannelFeed, resolveChannel } from './youtube.js';

// A video is the club's when its title or description names the club or the
// site: "Analog Racing Club", or "analogracingclub" as in the domain or a
// hashtag. Case and spacing don't matter.
export const PHRASES = ['Analog Racing Club', 'analogracingclub'];

// A live stream or upload that goes up shortly before a race starts is about
// that race, not the previous one: the window for a race opens this long
// before its session start.
export const LEAD_MS = 3 * 60 * 60 * 1000;

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ');

/** Does the video name the club (or the site) in its title or description? */
export const mentionsClub = (v) => {
  const text = `${norm(v?.title)}\n${norm(v?.description)}`;
  return PHRASES.some((p) => text.includes(norm(p)));
};

/** Shape stored for a matched feed entry (no description — only the match matters). */
export const toStored = (v, channel, now = new Date()) => ({
  _id: v.videoId,
  channelId: channel._id,
  channelName: channel.name,
  title: v.title,
  thumbnail: v.thumbnail,
  url: `https://www.youtube.com/watch?v=${v.videoId}`,
  publishedAt: v.publishedAt,
  hidden: false,
  fetchedAt: now,
});

/** The public shape of a stored video. */
export const publicVideo = (v) => ({
  id: v._id, title: v.title, channel: v.channelName, thumbnail: v.thumbnail, url: v.url, publishedAt: v.publishedAt,
});

/**
 * Bucket videos onto events: each video goes to the event with the latest
 * start that precedes its publish time (less the lead window). Videos before
 * the first event, or with no publish time, are left out. Pure.
 * `events` are { _id, startTime } (any order); returns Map eventId → videos
 * (newest first).
 */
export function assignVideos(events, videos) {
  const starts = events
    .map((e) => ({ id: e._id, at: new Date(e.startTime ?? NaN).getTime() - LEAD_MS }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at);
  const out = new Map();
  for (const v of videos) {
    const t = new Date(v.publishedAt ?? NaN).getTime();
    if (!Number.isFinite(t)) continue;
    let hit = null;
    for (const e of starts) { if (e.at <= t) hit = e; else break; }
    if (!hit) continue;
    if (!out.has(hit.id)) out.set(hit.id, []);
    out.get(hit.id).push(v);
  }
  for (const list of out.values()) list.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return out;
}

/** Map eventId → public videos for every stored event, from the live collections. */
export async function videosByEvent(db, { includeHidden = false } = {}) {
  const { subsessions, videos } = collections(db);
  const [events, vids] = await Promise.all([
    subsessions.find({}, { projection: { startTime: 1 } }).toArray(),
    videos.find(includeHidden ? {} : { hidden: { $ne: true } }).toArray(),
  ]);
  const map = assignVideos(events, vids);
  for (const [k, list] of map) map.set(k, list.map(publicVideo));
  return map;
}

/**
 * Every video shown on the site, newest first, for the /videos page. Each
 * carries the race it belongs to (null when none ran before it) so the page
 * can caption it and link to that round's results.
 */
export async function listVideosPublic(db) {
  const { videos, subsessions, series } = collections(db);
  const [vids, events, allSeries] = await Promise.all([
    videos.find({ hidden: { $ne: true } }).sort({ publishedAt: -1 }).toArray(),
    subsessions.find({}, { projection: { startTime: 1, seriesSlug: 1, round: 1, title: 1, track: 1 } }).toArray(),
    series.find({}, { projection: { slug: 1, name: 1 } }).toArray(),
  ]);
  const seriesName = new Map(allSeries.map((s) => [s.slug, s.name]));
  const eventById = new Map(events.map((e) => [e._id, e]));
  const eventOf = new Map();
  for (const [id, list] of assignVideos(events, vids)) for (const v of list) eventOf.set(v._id, eventById.get(id));
  return vids.map((v) => {
    const e = eventOf.get(v._id);
    return {
      ...publicVideo(v),
      event: !e ? null : {
        series: e.seriesSlug ? seriesName.get(e.seriesSlug) ?? e.seriesSlug : null,
        round: e.seriesSlug ? e.round ?? null : null,
        title: e.seriesSlug ? null : e.title ?? null,
        track: e.track?.name ?? null,
        href: e.seriesSlug ? `/results?series=${encodeURIComponent(e.seriesSlug)}&round=${e.round ?? ''}` : '/results?series=__special__',
      },
    };
  });
}

// ---- Channels ---------------------------------------------------------------

export const listChannels = (db) => collections(db).channels.find({}).sort({ addedAt: 1 }).toArray();

/** Add a channel from a URL/handle/id; polls it right away. { error } or { ok, channel, added }. */
export async function addChannel(db, input, now = new Date()) {
  let resolved;
  try { resolved = await resolveChannel(input); }
  catch (e) { return { error: e.message }; }
  const { channels } = collections(db);
  if (await channels.countDocuments({ _id: resolved.id })) return { error: `${resolved.name} is already listed` };
  const channel = { _id: resolved.id, name: resolved.name, url: resolved.url, addedAt: now, lastPolledAt: null, lastError: null, lastCount: 0 };
  await channels.insertOne(channel);
  const polled = await pollChannel(db, channel, now);
  return { ok: true, channel, added: polled.added };
}

/** Remove a channel and every video it contributed. */
export async function removeChannel(db, id) {
  const { channels, videos } = collections(db);
  const res = await channels.deleteOne({ _id: id });
  if (!res.deletedCount) return { error: 'channel not found' };
  const v = await videos.deleteMany({ channelId: id });
  return { ok: true, videos: v.deletedCount };
}

// ---- Polling ----------------------------------------------------------------

/** Read one channel's feed and store the uploads that mention the club. */
export async function pollChannel(db, channel, now = new Date()) {
  const { channels, videos } = collections(db);
  try {
    const { name, videos: entries } = await fetchChannelFeed(channel._id);
    const hits = entries.filter(mentionsClub);
    let added = 0;
    for (const v of hits) {
      const doc = toStored(v, { ...channel, name: name || channel.name }, now);
      // Keep what the admin set (hidden) on a video seen before; refresh the rest.
      const { hidden, ...rest } = doc;
      const r = await videos.updateOne({ _id: doc._id }, { $set: rest, $setOnInsert: { hidden } }, { upsert: true });
      if (r.upsertedCount) added++;
    }
    await channels.updateOne({ _id: channel._id }, { $set: { name: name || channel.name, lastPolledAt: now, lastError: null, lastCount: hits.length } });
    return { ok: true, added, matched: hits.length };
  } catch (e) {
    await channels.updateOne({ _id: channel._id }, { $set: { lastPolledAt: now, lastError: e.message } });
    return { error: e.message };
  }
}

/** Poll every channel; returns per-channel outcomes. */
export async function pollAll(db, now = new Date()) {
  const out = [];
  for (const ch of await listChannels(db)) out.push({ channel: ch.name, ...(await pollChannel(db, ch, now)) });
  return out;
}

// ---- Videos (admin) ---------------------------------------------------------

/** Every stored video, newest first, each with the event it currently belongs to (or null). */
export async function listVideosAdmin(db) {
  const { videos, subsessions } = collections(db);
  const [vids, events] = await Promise.all([
    videos.find({}).sort({ publishedAt: -1 }).toArray(),
    subsessions.find({}, { projection: { startTime: 1, seriesSlug: 1, round: 1, title: 1, track: 1 } }).toArray(),
  ]);
  const byEvent = assignVideos(events, vids);
  const eventOf = new Map();
  for (const [id, list] of byEvent) for (const v of list) eventOf.set(v._id, events.find((e) => e._id === id));
  return vids.map((v) => {
    const e = eventOf.get(v._id);
    return { ...v, event: e ? { id: e._id, seriesSlug: e.seriesSlug ?? null, round: e.round ?? null, title: e.title ?? null, track: e.track?.name ?? null } : null };
  });
}

/** Hide or show a video on the site. */
export async function setVideoHidden(db, id, hidden) {
  const r = await collections(db).videos.updateOne({ _id: id }, { $set: { hidden: !!hidden } });
  return r.matchedCount ? { ok: true } : { error: 'video not found' };
}
