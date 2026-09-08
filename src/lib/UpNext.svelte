<script>
  // "Up next": the next scheduled round, styled like the other feed posts.
  // With an image, the picture stands alone with the RSVP link overlaid in
  // its lower-left corner; without one, the round's details are written out.
  // The link goes to the round's event page, or the Discord invite.
  import { DISCORD_URL } from './links.js';

  let { next } = $props();
  const href = $derived(next.link || DISCORD_URL);
  const meta = $derived([next.series.name, `Round ${next.round}`, next.date, next.multiplier > 1 ? `${next.multiplier}× points` : null].filter(Boolean).join(' · '));
</script>

<article class="post up-next">
  {#if next.image}
    <p class="sched-round">Up next</p>
    <a class="up-next-media" href={href} target="_blank" rel="noopener" aria-label={`${meta} — ${next.track ?? 'Track TBA'}`}>
      <img class="up-next-image" src={next.image} alt="">
      <span class="link up-next-cta">RSVP on Discord →</span>
    </a>
  {:else}
    <p class="sched-round">Up next · {meta}</p>
    <h2 class="lp-h">{next.track ?? 'Track TBA'}</h2>
    <p class="latest-more"><a class="link" href={href} target="_blank" rel="noopener">RSVP on Discord →</a></p>
  {/if}
</article>
