<script>
  // One row of the newest race photos and videos, newest on the left, as
  // uniform 16:9 tiles that scroll sideways. A photo links to its race; a
  // video plays in its tile (privacy-enhanced embed, loaded only on a click).
  // Each tile's caption names what it is and the race it came from.
  let { items = [] } = $props();
  let playing = $state(null);
  const embed = (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
</script>

{#if items.length}
  <div class="strip">
    {#each items as m (m.key)}
      <figure class="tile">
        {#if m.kind === 'video'}
          {#if playing === m.id}
            <div class="frame">
              <iframe src={embed(m.id)} title={m.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
            </div>
          {:else}
            <button class="pic" type="button" aria-label={`Play ${m.title}`} title={m.title} onclick={() => (playing = m.id)}>
              <img src={m.image} alt="" loading="lazy">
              <span class="play" aria-hidden="true">▶</span>
            </button>
          {/if}
        {:else}
          <a class="pic" href={m.href}><img src={m.image} alt={m.caption} loading="lazy"></a>
        {/if}
        <figcaption><span class="kind">{m.kind}</span><span class="cap" title={m.caption}>{m.caption}</span></figcaption>
      </figure>
    {/each}
  </div>
{/if}

<style>
  .strip {
    display: flex; gap: 1rem; padding: 0 0 0.25rem;
    overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  .strip::-webkit-scrollbar { display: none; }
  /* On a phone the row bleeds to the screen edges so a tile peeks in from the right. */
  @media (max-width: 640px) {
    .strip { margin: 0 calc(-1 * var(--gutter)); padding: 0 var(--gutter) 0.25rem; scroll-padding: 0 var(--gutter); }
  }
  .tile { flex: 0 0 clamp(240px, 30vw, 340px); margin: 0; scroll-snap-align: start; min-width: 0; }
  .pic, .frame {
    position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
    border-radius: var(--radius); background: var(--panel); padding: 0; border: 0; cursor: pointer;
  }
  .pic img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.9); transition: transform 0.25s, filter 0.25s; }
  .pic:hover img { filter: saturate(1.05); transform: scale(1.03); }
  .play {
    position: absolute; inset: 0; margin: auto; width: 3rem; height: 3rem; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; padding-left: 0.2rem;
    background: rgba(14, 14, 14, 0.8); color: var(--accent); font-size: 1.1rem; transition: background 0.15s;
  }
  .pic:hover .play { background: rgba(14, 14, 14, 0.95); }
  .frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  figcaption {
    display: flex; gap: 0.6rem; align-items: baseline; margin-top: 0.6rem; min-width: 0;
    font-family: var(--display); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .kind { color: var(--muted); flex: 0 0 auto; }
  .cap { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
