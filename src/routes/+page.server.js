import { buildFeed } from '$lib/server/feed.js';
import { buildSidebar } from '$lib/server/sidebar.js';

// The homepage is a feed: the first page of posts (results derived from stored
// events, plus authored schedule posts), merged newest-first. The page
// auto-loads further pages from /api/feed as the reader scrolls.
const PAGE_SIZE = 3;

export async function load({ locals }) {
  const [{ posts, hasMore }, sidebar] = await Promise.all([
    buildFeed(locals.db, { offset: 0, limit: PAGE_SIZE }),
    buildSidebar(locals.db),
  ]);
  return { posts, hasMore, pageSize: PAGE_SIZE, sidebar };
}
