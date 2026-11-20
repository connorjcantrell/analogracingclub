import { listSubsessions, listPhotos } from '$lib/server/api/queries.js';
import { adminMeta, listAdminSeries } from '$lib/server/admin/ops.js';
import { listPosts } from '$lib/server/posts.js';
import { listChannels, listVideosAdmin } from '$lib/server/videos/index.js';
import { listSeasons, publicSeason } from '$lib/server/season.js';

// The gate ran in hooks.server.js; this just gathers what the page shows. The
// page mutates through /api/admin/* and calls invalidateAll() to re-run this.
export async function load({ locals }) {
  const [seasons, series, subsessions, posts, photos, channels, videos] = await Promise.all([
    listSeasons(locals.db),
    listAdminSeries(locals.db),
    listSubsessions(locals.db),
    listPosts(locals.db),
    listPhotos(locals.db, { limit: Infinity }),
    listChannels(locals.db),
    listVideosAdmin(locals.db),
  ]);
  return { meta: adminMeta(), seasons: seasons.map(publicSeason), series, subsessions, posts, photos, channels, videos };
}
