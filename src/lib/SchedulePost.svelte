<script>
  // A schedule post: an announcement for an upcoming season, with an optional
  // intro blurb, the round-by-round schedule (track · config · date), and a
  // carousel of photos hand-picked from past results. Replaces what used to be
  // the hardcoded Season-2 section on the homepage.
  import Carousel from './Carousel.svelte';

  let { post } = $props();
  const rounds = $derived(post.rounds ?? []);
  const photos = $derived(post.photos ?? []);
</script>

<article class="post">
  <p class="sched-round">Schedule</p>
  <h2 class="lp-h">{post.title}</h2>
  {#if post.intro}<p class="lp-sub">{post.intro}</p>{/if}

  <div class={['season-layout', { 'no-photos': !photos.length }]}>
    {#if photos.length}<Carousel {photos} />{/if}
    <div class="season-schedule">
      {#each rounds as r (r.round)}
        <div class="sched-card">
          <p class="sched-round">R{r.round}{#if r.date} · {r.date}{/if}</p>
          <span class="sched-track">{r.track ?? 'TBA'}</span>
          {#if r.config}<p class="sched-config">{r.config}</p>{/if}
        </div>
      {/each}
    </div>
  </div>
</article>
