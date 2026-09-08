<script>
  // "Up next": the next scheduled round, styled like the other feed posts,
  // titled by season and round. With an image, the picture follows with the
  // RSVP link overlaid in its lower-left corner; without one, the track is
  // written out instead.
  // The link goes to the round's event page, or the Discord invite.
  import { DISCORD_URL } from './links.js';

  let { next } = $props();
  const href = $derived(next.link || DISCORD_URL);
  const meta = $derived([next.series.name, `Round ${next.round}`, next.date, next.multiplier > 1 ? `${next.multiplier}× points` : null].filter(Boolean).join(' · '));
</script>

<article class="post up-next">
  <p class="sched-round">Up next{next.date ? ` · ${next.date}` : ''}</p>
  <h2 class="lp-h">{next.series.name} · Round {next.round}</h2>
  {#if next.image}
    <a class="up-next-media" href={href} target="_blank" rel="noopener" aria-label={`${meta} — ${next.track ?? 'Track TBA'}`}>
      <img class="up-next-image" src={next.image} alt="">
      <span class="up-next-cta">RSVP on Discord →</span>
    </a>
  {:else}
    <p class="lp-sub">{[next.track ?? 'Track TBA', next.multiplier > 1 ? `${next.multiplier}× points` : null].filter(Boolean).join(' · ')}</p>
    <p class="latest-more"><a class="link" href={href} target="_blank" rel="noopener">RSVP on Discord →</a></p>
  {/if}
</article>
