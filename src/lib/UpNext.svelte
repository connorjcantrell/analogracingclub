<script>
  // Banner above the feed for the next scheduled round. With an image it is a
  // 2:1 picture with the details overlaid; without, a bordered strip.
  import { DISCORD_URL } from './links.js';

  let { next } = $props();
  const href = $derived(next.link || DISCORD_URL);
  const cta = $derived(next.link ? 'Event details →' : 'RSVP on Discord →');
  const meta = $derived([next.series.name, `Round ${next.round}`, next.date, next.multiplier > 1 ? `${next.multiplier}× points` : null].filter(Boolean).join(' · '));
</script>

<a class={['up-next', { 'has-image': !!next.image }]} href={href} target="_blank" rel="noopener">
  {#if next.image}<img class="up-next-image" src={next.image} alt="">{/if}
  <div class="up-next-body">
    <p class="up-next-kicker">Up next · {meta}</p>
    <p class="up-next-track">{next.track ?? 'Track TBA'}</p>
    <span class="link">{cta}</span>
  </div>
</a>
