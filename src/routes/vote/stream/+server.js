import { getCurrentSession, sessionStatus, tally } from '$lib/server/vote/index.js';

// Live tally over Server-Sent Events: re-reads the ballots every few seconds
// and pushes only when the numbers change. A comment heartbeat keeps proxies
// (Caddy, Cloudflare ~100s idle cutoff) from dropping the connection. Once the
// window closes the final tally is sent with status "closed" and the stream
// ends — the client stops reconnecting at that point.
const POLL_MS = 3000;
const HEARTBEAT_MS = 25_000;

export async function GET({ locals }) {
  const db = locals.db;
  const session = await getCurrentSession(db);
  if (!session) return new Response('no vote session', { status: 404 });

  let poll, heartbeat;
  const stop = () => { clearInterval(poll); clearInterval(heartbeat); };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (s) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };
      let last = '';
      const push = async () => {
        const status = sessionStatus(session);
        const t = await tally(db, session._id);
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
