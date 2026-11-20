import { sessionStatus } from '$lib/server/vote/index.js';
import { getCurrentSelection, voteTally } from '$lib/server/track-selection/index.js';

// Live tally of the community track vote over Server-Sent Events, the same
// way /vote/stream works: re-read the ballots every few seconds, push only
// when the numbers change, heartbeat to keep proxies from dropping the
// connection, and end the stream once the window closes.
const POLL_MS = 3000;
const HEARTBEAT_MS = 25_000;

export async function GET({ locals }) {
  const db = locals.db;
  const selection = await getCurrentSelection(db);
  if (!selection?.vote) return new Response('no community vote', { status: 404 });

  let poll, heartbeat;
  const stop = () => { clearInterval(poll); clearInterval(heartbeat); };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (s) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };
      let last = '';
      const push = async () => {
        const status = sessionStatus(selection.vote);
        const t = await voteTally(db, selection);
        const payload = JSON.stringify({ status, ...t });
        if (payload !== last) { last = payload; send(`data: ${payload}\n\n`); }
        if (status === 'closed') { stop(); try { controller.close(); } catch { /* already gone */ } }
      };
      await push();
      poll = setInterval(push, POLL_MS);
      heartbeat = setInterval(() => send(': hb\n\n'), HEARTBEAT_MS);
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
