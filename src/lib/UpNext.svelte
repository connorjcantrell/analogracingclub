<script>
  // "Up next": the next scheduled round, styled like the other feed posts and
  // titled by season, round and start time. With an image, the framed picture
  // follows; without one, the track is written out. The RSVP link beneath goes
  // to the round's event page, or the Discord invite.
  import { DISCORD_URL } from './links.js';
  import { fmtStartTime, countdown } from './format.js';

  let { next } = $props();
  // The countdown depends on the clock, so it is computed in the browser only
  // (never in server HTML, which would go stale and mismatch on hydration)
  // and refreshed every half minute.
  let now = $state(null);
  $effect(() => {
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const soon = $derived(now == null ? null : countdown(next.startTime, now));
  const href = $derived(next.link || DISCORD_URL);
  const when = $derived(fmtStartTime(next.startTime) ?? next.date ?? null);
  const title = $derived([next.series.name, `Round ${next.round}`, when].filter(Boolean).join(' · '));
</script>

<article class="post up-next">
  <p class="sched-round">Up next{soon ? ` · ${soon}` : ''}</p>
  <h2 class="lp-h">{title}</h2>
  {#if next.image}
    <a class="up-next-media" href={href} target="_blank" rel="noopener" aria-label={`${title} — ${next.track ?? 'Track TBA'}`}>
      <img class="up-next-image" src={next.image} alt="">
    </a>
  {:else}
    <p class="lp-sub">{[next.track ?? 'Track TBA', next.multiplier > 1 ? `${next.multiplier}× points` : null].filter(Boolean).join(' · ')}</p>
  {/if}
  <p class="latest-more"><a class="link" href={href} target="_blank" rel="noopener">RSVP on Discord →</a></p>
</article>
