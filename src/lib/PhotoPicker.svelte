<script>
  // Multi-select grid of past-result photos for the schedule-post carousel.
  // `selected` is a bindable array of urls, in click order (which becomes the
  // carousel order).
  let { photos = [], selected = $bindable([]) } = $props();

  const isOn = (url) => selected.includes(url);
  const label = (p) => [p.track, p.config].filter(Boolean).join(' — ');
  function toggle(url) {
    selected = isOn(url) ? selected.filter((u) => u !== url) : [...selected, url];
  }
</script>

{#if !photos.length}
  <p class="empty">No result photos uploaded yet.</p>
{:else}
  <p class="desc">{selected.length} selected. Click to add or remove; click order sets the carousel order.</p>
  <div class="picker">
    {#each photos as p (p.url)}
      <button
        type="button"
        class={['pick', { on: isOn(p.url) }]}
        title={label(p)}
        aria-pressed={isOn(p.url)}
        onclick={() => toggle(p.url)}>
        <img src={p.url} alt={label(p)} loading="lazy">
        {#if isOn(p.url)}<span class="pick-badge">{selected.indexOf(p.url) + 1}</span>{/if}
      </button>
    {/each}
  </div>
{/if}
