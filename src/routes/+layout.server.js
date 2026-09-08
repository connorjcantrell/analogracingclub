import { latestFeaturedImage } from '$lib/server/views.js';
import { ogNameFor, OG_WIDTH, OG_HEIGHT } from '$lib/server/og.js';

// Link-preview (Open Graph) data for every page: the newest result's featured
// photo (or the logo), served resized to 1200×630 from /og/<name>.jpg. Absolute
// URLs, as the crawlers require.
export async function load({ locals, url }) {
  const featured = await latestFeaturedImage(locals.db);
  return {
    og: {
      image: `${url.origin}/og/${ogNameFor(featured?.url)}`,
      width: OG_WIDTH, height: OG_HEIGHT,
      imageAlt: featured?.alt || 'Analog Racing Club',
      url: `${url.origin}${url.pathname}`,
      siteName: 'Analog Racing Club',
      description: 'An iRacing community built around analog cars (no TC, ESC, or ABS). Stock cars, vintage GT and formula, Australian Supercars.',
    },
  };
}
