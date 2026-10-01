// Background poll of the YouTube channels, started once per process from the
// request hook. The timer is unref'd so it never holds the process open at
// shutdown. VIDEO_POLL_MINUTES=0 disables it (the admin's "Check now" still works).
import { VIDEO_POLL_MINUTES } from '../config.js';
import { pollAll } from './index.js';

let started = false;

export function startVideoPoller(db) {
  if (started || !(VIDEO_POLL_MINUTES > 0)) return;
  started = true;
  const run = async () => {
    try {
      const res = await pollAll(db);
      const added = res.reduce((n, r) => n + (r.added ?? 0), 0);
      const failed = res.filter((r) => r.error);
      if (added || failed.length) console.log(`videos: ${added} new${failed.length ? `; ${failed.map((f) => `${f.channel}: ${f.error}`).join(', ')}` : ''}`);
    } catch (e) { console.error('videos: poll failed', e); }
  };
  // First pass soon after boot, then on the interval.
  setTimeout(run, 10_000).unref();
  setInterval(run, VIDEO_POLL_MINUTES * 60_000).unref();
}
