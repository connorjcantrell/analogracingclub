import { listVideosPublic } from '$lib/server/videos/index.js';

// Every race video from the followed YouTube channels, newest first.
export async function load({ locals }) {
  return { videos: await listVideosPublic(locals.db) };
}
