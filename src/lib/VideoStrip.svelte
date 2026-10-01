<script>
  // Race videos for one event: a row of YouTube thumbnails. Clicking one plays
  // it in place (privacy-enhanced embed), so the page loads no YouTube code
  // until a viewer asks for it. Renders nothing without videos. `feed` stacks
  // the videos one per row at full width (the /videos page) instead of the
  // thumbnail grid; a video that carries an `event` gets a caption naming its
  // race, and the feed adds the publish date.
  import { fmtDate } from './format.js';
  let { videos = [], feed = false } = $props();
  const raceLabel = (e) => [e.series, e.round != null ? `Round ${e.round}` : null, e.title, e.track].filter(Boolean).join(' · ');
  let playing = $state(null);
  const embed = (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
</script>

{#if videos.length}
  <div class={['videos', { 'videos-feed': feed }]}>
    {#each videos as v (v.id)}
      <figure class={['video', { playing: playing === v.id }]}>
        {#if playing === v.id}
          <div class="video-frame">
            <iframe src={embed(v.id)} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
        {:else}
          <button class="video-thumb" type="button" aria-label={`Play ${v.title}`} onclick={() => (playing = v.id)}>
            <img src={v.thumbnail} alt="" loading="lazy">
            <span class="video-play" aria-hidden="true">▶</span>
          </button>
        {/if}
        <figcaption>
          <a class="video-title" href={v.url} target="_blank" rel="noopener">{v.title}</a>
          <span class="video-channel">{v.channel}{#if feed} · {fmtDate(v.publishedAt)}{/if}</span>
          {#if v.event}<a class="video-race" href={v.event.href}>{raceLabel(v.event)}</a>{/if}
        </figcaption>
      </figure>
    {/each}
  </div>
{/if}
