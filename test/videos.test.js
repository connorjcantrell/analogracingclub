import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, channelIdFrom, channelPageUrl, channelIdFromPage } from '../src/lib/server/videos/youtube.js';
import { mentionsClub, assignVideos, toStored, LEAD_MS } from '../src/lib/server/videos/index.js';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <yt:channelId>abc</yt:channelId>
 <title>Some Racer</title>
 <entry>
  <id>yt:video:AAA111</id>
  <yt:videoId>AAA111</yt:videoId>
  <yt:channelId>UCabc</yt:channelId>
  <title>Round 3 &amp; a half — Analog Racing Club</title>
  <author><name>Some Racer</name></author>
  <published>2026-09-18T03:10:00+00:00</published>
  <media:group>
   <media:title>Round 3 &amp; a half — Analog Racing Club</media:title>
   <media:thumbnail url="https://i4.ytimg.com/vi/AAA111/hqdefault.jpg" width="480" height="360"/>
   <media:description>Full race from Lime Rock.
Second line &lt;b&gt;here&lt;/b&gt;</media:description>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>BBB222</yt:videoId>
  <yt:channelId>UCabc</yt:channelId>
  <title>Unrelated short</title>
  <published>2026-09-10T00:00:00+00:00</published>
  <media:group><media:title>Unrelated short</media:title><media:description></media:description></media:group>
 </entry>
</feed>`;

test('parseFeed reads each entry with decoded text, thumbnail and publish time', () => {
  const out = parseFeed(FEED);
  assert.equal(out.length, 2);
  const [a, b] = out;
  assert.equal(a.videoId, 'AAA111');
  assert.equal(a.channelId, 'UCabc');
  assert.equal(a.channelName, 'Some Racer');
  assert.equal(a.title, 'Round 3 & a half — Analog Racing Club');
  assert.equal(a.description, 'Full race from Lime Rock.\nSecond line <b>here</b>');
  assert.equal(a.thumbnail, 'https://i4.ytimg.com/vi/AAA111/hqdefault.jpg');
  assert.equal(a.publishedAt.toISOString(), '2026-09-18T03:10:00.000Z');
  // Missing thumbnail falls back to the standard URL; the feed title names the channel.
  assert.equal(b.thumbnail, 'https://i.ytimg.com/vi/BBB222/hqdefault.jpg');
  assert.equal(b.channelName, 'Some Racer');
  assert.deepEqual(parseFeed(''), []);
});

test('mentionsClub matches the club name or domain in title or description, loosely on case and spacing', () => {
  assert.equal(mentionsClub({ title: 'ANALOG racing  club round 1', description: '' }), true);
  assert.equal(mentionsClub({ title: 'Tuesday night', description: 'Racing with the Analog Racing Club again' }), true);
  assert.equal(mentionsClub({ title: 'Analog Racing', description: 'club night' }), false);
  // The site's domain (or a hashtag) counts too.
  assert.equal(mentionsClub({ title: 'Sebring onboard', description: 'Results at https://analogracingclub.com/results' }), true);
  assert.equal(mentionsClub({ title: 'Sebring onboard #AnalogRacingClub', description: '' }), true);
  assert.equal(mentionsClub({}), false);
  assert.equal(parseFeed(FEED).filter(mentionsClub).map((v) => v.videoId).join(), 'AAA111');
});

test('channelIdFrom accepts a bare id or a /channel/ URL only', () => {
  assert.equal(channelIdFrom('UCX6OQ3DkcsbYNE6H8uQQuVA'), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
  assert.equal(channelIdFrom(' https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA/videos '), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
  assert.equal(channelIdFrom('https://www.youtube.com/@MrBeast'), null);
  assert.equal(channelIdFrom('@MrBeast'), null);
  assert.equal(channelIdFrom(''), null);
});

test('channelPageUrl turns handles and bare domains into a YouTube URL, and rejects other sites', () => {
  assert.equal(channelPageUrl('@MrBeast'), 'https://www.youtube.com/@MrBeast');
  assert.equal(channelPageUrl('youtube.com/c/SomeRacer'), 'https://youtube.com/c/SomeRacer');
  assert.equal(channelPageUrl('https://www.youtube.com/user/racer?sub_confirmation=1#x'), 'https://www.youtube.com/user/racer');
  assert.equal(channelPageUrl('https://vimeo.com/racer'), null);
  assert.equal(channelPageUrl('not a url at all'), null);
  assert.equal(channelPageUrl(''), null);
});

test('channelIdFromPage reads the canonical link, else the identifier meta', () => {
  const canon = '<html><link rel="canonical" href="https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA"><script>"channelId":"UCother000000000000000000"</script>';
  assert.equal(channelIdFromPage(canon), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
  assert.equal(channelIdFromPage('<meta itemprop="identifier" content="UCX6OQ3DkcsbYNE6H8uQQuVA">'), 'UCX6OQ3DkcsbYNE6H8uQQuVA');
  assert.equal(channelIdFromPage('<html>nothing</html>'), null);
});

test('toStored keeps the fields the site shows, unhidden, keyed by video id', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  const v = parseFeed(FEED)[0];
  assert.deepEqual(toStored(v, { _id: 'UCabc', name: 'Some Racer' }, now), {
    _id: 'AAA111', channelId: 'UCabc', channelName: 'Some Racer',
    title: 'Round 3 & a half — Analog Racing Club',
    thumbnail: 'https://i4.ytimg.com/vi/AAA111/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=AAA111',
    publishedAt: v.publishedAt, hidden: false, fetchedAt: now,
  });
});

const H = 3_600_000;
const events = [
  { _id: 'r2', startTime: '2026-09-25T02:30:00Z' },
  { _id: 'r1', startTime: '2026-09-18T02:30:00Z' },
  { _id: 'bad', startTime: null },
];
const at = (iso, id = iso) => ({ _id: id, publishedAt: new Date(iso) });

test('assignVideos gives each video to the latest race that started before it', () => {
  const map = assignVideos(events, [
    at('2026-09-18T05:00:00Z', 'same-night'),
    at('2026-09-20T12:00:00Z', 'two-days-later'),
    at('2026-09-25T06:00:00Z', 'after-r2'),
  ]);
  assert.deepEqual([...map.keys()].sort(), ['r1', 'r2']);
  assert.deepEqual(map.get('r1').map((v) => v._id), ['two-days-later', 'same-night']); // newest first
  assert.deepEqual(map.get('r2').map((v) => v._id), ['after-r2']);
});

test('assignVideos opens a race window a few hours early, for streams that go live before the start', () => {
  const r2 = new Date('2026-09-25T02:30:00Z').getTime();
  const map = assignVideos(events, [
    at(new Date(r2 - LEAD_MS + 60_000).toISOString(), 'stream'), // inside the lead window → r2
    at(new Date(r2 - LEAD_MS - 60_000).toISOString(), 'earlier'), // just outside → r1
  ]);
  assert.deepEqual(map.get('r2').map((v) => v._id), ['stream']);
  assert.deepEqual(map.get('r1').map((v) => v._id), ['earlier']);
  assert.ok(LEAD_MS >= H && LEAD_MS <= 6 * H);
});

test('assignVideos drops videos older than every race, with no publish time, or when there are no races', () => {
  const map = assignVideos(events, [at('2026-01-01T00:00:00Z', 'old'), { _id: 'nodate', publishedAt: null }]);
  assert.equal(map.size, 0);
  assert.equal(assignVideos([], [at('2026-09-20T00:00:00Z')]).size, 0);
});
