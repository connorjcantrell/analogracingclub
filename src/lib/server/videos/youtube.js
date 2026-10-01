// YouTube without an API key: each channel publishes an Atom feed of its
// latest ~15 uploads (title, description, thumbnail, publish time), and a
// channel page names its id in its canonical link. Pure parsers here are
// unit-tested; the fetchers wrap them with the network.

const FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const UA = 'Mozilla/5.0 (compatible; analogracingclub.com)';

const decode = (s) => String(s ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1].trim()) : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\s[^>]*?\\b${a}="([^"]*)"`)); return m ? decode(m[1]) : ''; };

/** Parse a channel's Atom feed into plain video entries, newest first as YouTube lists them. */
export function parseFeed(xml) {
  const channelName = tag(xml.split('<entry')[0], 'title');
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = tag(e, 'yt:videoId');
    if (!videoId) continue;
    out.push({
      videoId,
      channelId: tag(e, 'yt:channelId'),
      channelName: tag(e, 'name') || channelName,
      title: tag(e, 'media:title') || tag(e, 'title'),
      description: tag(e, 'media:description'),
      publishedAt: new Date(tag(e, 'published')),
      thumbnail: attr(e, 'media:thumbnail', 'url') || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
  return out;
}

/** A channel id straight from the input, when the admin pasted one (or a /channel/ URL). */
export function channelIdFrom(input) {
  const s = String(input ?? '').trim();
  if (CHANNEL_ID.test(s)) return s;
  const m = s.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  return m ? m[1] : null;
}

/** Normalise what the admin typed into a channel page URL YouTube will answer. */
export function channelPageUrl(input) {
  let s = String(input ?? '').trim();
  if (!s) return null;
  if (/^@[\w.-]+$/.test(s)) s = `https://www.youtube.com/${s}`;
  else if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return null;
  u.search = ''; u.hash = '';
  return u.toString();
}

/** The channel id named on a channel page (its canonical link or identifier meta). */
export function channelIdFromPage(html) {
  const s = String(html ?? '');
  const m = s.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
    ?? s.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)
    ?? s.match(/"externalId":"(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

// Thumbnail files per video, largest first. The feed names only hqdefault
// (480×360, letterboxed); the 1280×720 maxresdefault exists for most uploads
// but not all, and sddefault (640×480) for most of the rest.
export const THUMB_SIZES = ['maxresdefault', 'sddefault', 'hqdefault'];
export const thumbUrl = (videoId, size) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`;

/** The largest thumbnail YouTube serves for a video; `exists` is injectable for tests. */
export async function bestThumbnail(videoId, exists = headOk) {
  for (const size of THUMB_SIZES.slice(0, -1)) {
    if (await exists(thumbUrl(videoId, size))) return thumbUrl(videoId, size);
  }
  return thumbUrl(videoId, THUMB_SIZES.at(-1));
}

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8_000) });
    return r.ok;
  } catch { return false; }
}

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from YouTube`);
  return r.text();
}

/** Fetch and parse a channel's feed. Returns { name, videos }. */
export async function fetchChannelFeed(channelId) {
  const xml = await get(FEED(channelId));
  const videos = parseFeed(xml);
  return { name: tag(xml.split('<entry')[0], 'title'), videos };
}

/**
 * Resolve whatever the admin pasted (a channel URL, an @handle, a /c/ or
 * /user/ page, or a bare id) to { id, name, url }. Throws on anything that
 * does not lead to a channel.
 */
export async function resolveChannel(input) {
  let id = channelIdFrom(input);
  if (!id) {
    const page = channelPageUrl(input);
    if (!page) throw new Error('enter a YouTube channel URL or @handle');
    id = channelIdFromPage(await get(page));
    if (!id) throw new Error('that page does not look like a YouTube channel');
  }
  const { name } = await fetchChannelFeed(id);
  return { id, name: name || id, url: `https://www.youtube.com/channel/${id}` };
}
