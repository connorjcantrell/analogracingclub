// The homepage feed: a reverse-chronological stream that merges authored posts
// (currently schedule announcements) with results posts derived on the fly from
// stored subsessions. Paginated by offset/limit so the page can load 3 at a
// time and auto-load more.
import { collections } from './db/index.js';
import { getSeries } from './api/queries.js';
import { publicSeries, withEventType } from './views.js';
import { resultPostTitle } from './recap.js';

const epoch = (d) => new Date(d ?? 0).getTime();

export async function buildFeed(db, { offset = 0, limit = 3 } = {}) {
  const { posts, subsessions } = collections(db);
  const [authored, subs] = await Promise.all([
    posts.find({}).sort({ publishedAt: -1 }).toArray(),
    subsessions.find({}, { projection: { raw: 0 } }).sort({ startTime: -1 }).toArray(),
  ]);

  // One time-ordered index across both sources, then page it.
  const index = [
    ...authored.map((p) => ({ kind: 'authored', date: epoch(p.publishedAt), post: p })),
    ...subs.map((s) => ({ kind: 'result', date: epoch(s.startTime), sub: s })),
  ].sort((a, b) => b.date - a.date);
  const slice = index.slice(offset, offset + limit);

  // Hydrate only the slice. Cache raw series docs (for the descriptor + title)
  // across the slice so a batch of the same series' rounds resolves once.
  const seriesById = new Map();
  const getRawSeries = async (slug) => {
    if (!seriesById.has(slug)) seriesById.set(slug, await getSeries(db, slug));
    return seriesById.get(slug);
  };

  const out = [];
  for (const item of slice) {
    if (item.kind === 'authored') out.push(hydrateSchedule(item.post));
    else out.push(await hydrateResult(item.sub, getRawSeries));
  }
  return { posts: out, hasMore: offset + limit < index.length };
}

async function hydrateResult(sub, getRawSeries) {
  const raw = sub.seriesSlug ? await getRawSeries(sub.seriesSlug) : null;
  const series = raw ? publicSeries(raw) : null;
  const withType = withEventType(sub, raw?.eventType);
  return {
    id: sub._id,
    type: 'result',
    date: sub.startTime,
    series,
    subsession: withType,
    // An admin-set headline wins over the automatic one; the paragraph is
    // editorial only (there is none unless written).
    title: sub.postTitle || resultPostTitle(series, withType),
    body: sub.postBody ?? '',
  };
}

function hydrateSchedule(post) {
  return {
    id: post._id,
    type: 'schedule',
    date: post.publishedAt,
    seriesSlug: post.seriesSlug,
    title: post.title,
    intro: post.intro,
    rounds: post.rounds ?? [],
    photos: post.photos ?? [],
  };
}
