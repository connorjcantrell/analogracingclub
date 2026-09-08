<script>
  // Season photo carousel. It keeps its own index rather than reading it back
  // off the scroll offset: a timer that fires mid-animation (or after a
  // background tab throttled it) would otherwise see a stale position and skip
  // or repeat a photo. Each photo dwells DWELL ms, timed from when it lands.
  //
  // The strip is padded with a copy of the last photo in front and the first
  // photo behind, so the loop always slides the same direction: the last photo
  // glides left into the copy of the first, and once the scroll settles we cut
  // to the real first photo at the identical picture.
  let { photos = [] } = $props();

  const DWELL = 4000;
  const n = $derived(photos.length);
  const alt = (p) => [p.track, p.config].filter(Boolean).join(' — ');

  let track;
  let current = $state(0); // real photo index, 0..n-1
  let phys = 1;            // strip position, 0..n+1 (0 and n+1 are the copies)
  let timer = null;
  let settle = null;

  const W = () => track.clientWidth;
  const jump = (p) => { phys = p; track.scrollTo({ left: p * W(), behavior: 'instant' }); };
  function show(i) {
    const next = ((i % n) + n) % n;
    // Neighbours glide (through the copies at the ends); a longer jump cuts.
    let target = next + 1;
    if (current === n - 1 && next === 0) target = n + 1;
    else if (current === 0 && next === n - 1) target = 0;
    const behavior = Math.abs(target - phys) === 1 ? 'smooth' : 'instant';
    current = next; phys = target;
    track.scrollTo({ left: target * W(), behavior });
  }
  const stop = () => { clearTimeout(timer); timer = null; };
  const tick = () => { timer = setTimeout(() => { show(current + 1); tick(); }, DWELL); };
  const start = () => { if (!timer && !document.hidden && n > 1) tick(); };
  const restart = () => { stop(); start(); };
  const nav = (i) => { show(i); restart(); };

  // Once a scroll comes to rest: if it stopped on a copy, cut to the real photo
  // it duplicates; if a finger swipe landed elsewhere, adopt that photo and give
  // it a full dwell.
  function onscroll() {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const p = Math.round(track.scrollLeft / W());
      if (p === n + 1) { jump(1); return; }
      if (p === 0) { jump(n); return; }
      if (p - 1 !== current) { current = p - 1; phys = p; restart(); }
    }, 150);
  }

  $effect(() => {
    jump(1);
    start();
    return () => { stop(); clearTimeout(settle); };
  });
</script>

<!-- Pause while the tab is hidden; a resize re-aligns the current slide (widths change, the index doesn't). -->
<svelte:document onvisibilitychange={() => (document.hidden ? stop() : start())} />
<svelte:window onresize={() => jump(phys)} />

<div class="carousel" onpointerenter={stop} onpointerleave={start}>
  <div class="carousel-track" bind:this={track} {onscroll}>
    {#if n > 1}<img class="carousel-slide" aria-hidden="true" src={photos[n - 1].url} alt="" decoding="async">{/if}
    {#each photos as p (p.url)}
      <img class="carousel-slide" src={p.url} alt={alt(p)} decoding="async">
    {/each}
    {#if n > 1}<img class="carousel-slide" aria-hidden="true" src={photos[0].url} alt="" decoding="async">{/if}
  </div>
  {#if n > 1}
    <button class="carousel-nav prev" type="button" aria-label="Previous photo" onclick={() => nav(current - 1)}>‹</button>
    <button class="carousel-nav next" type="button" aria-label="Next photo" onclick={() => nav(current + 1)}>›</button>
    <div class="carousel-dots">
      {#each photos as p, i (p.url)}
        <button type="button" class={{ active: i === current }} aria-label={`Go to photo ${i + 1}`} onclick={() => nav(i)}></button>
      {/each}
    </div>
  {/if}
</div>
