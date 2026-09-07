<script>
  // Grid of race photos with a click-to-enlarge lightbox. Render nothing when
  // there are no images so callers can wrap it in their own section.
  let { images = [] } = $props();

  let open = $state(false);
  let current = $state(0);
  const n = $derived(images.length);

  const show = (i) => { current = (i + n) % n; };
  const openAt = (i) => { show(i); open = true; };
  const close = () => { open = false; };

  // The page behind the lightbox must not scroll while it is up.
  $effect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  });
</script>

<svelte:document onkeydown={(e) => {
  if (!open) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') show(current - 1);
  else if (e.key === 'ArrowRight') show(current + 1);
}} />

{#if n}
  <div class="gallery-wrap">
    <div class="gallery">
      {#each images as img, i (img.url)}
        <button class="shot" type="button" aria-label={`Enlarge ${img.name ?? `photo ${i + 1}`}`} onclick={() => openAt(i)}>
          <img src={img.url} alt={img.name ?? `Race photo ${i + 1}`} loading="lazy">
        </button>
      {/each}
    </div>
    {#if open}
      <!-- Click the backdrop (but not the image or controls) to dismiss. -->
      <div class="lightbox" role="dialog" aria-modal="true" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <button class="lightbox-close" type="button" aria-label="Close" onclick={close}>×</button>
        <button class="lightbox-nav prev" type="button" aria-label="Previous" onclick={() => show(current - 1)}>‹</button>
        <img class="lightbox-img" src={images[current].url} alt="">
        <button class="lightbox-nav next" type="button" aria-label="Next" onclick={() => show(current + 1)}>›</button>
        <p class="lightbox-caption">{current + 1} / {n}</p>
      </div>
    {/if}
  </div>
{/if}
