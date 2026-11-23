<script>
  // An "i" button that opens a small panel of explanation: on hover, on
  // keyboard focus, and on a tap. Escape, blur, or a tap elsewhere closes it.
  // The panel is fixed to the viewport (a scrolling table cannot clip it) and
  // sits beneath the button, kept inside the screen with a margin either side,
  // so it fits a phone whole. A `button` snippet replaces the "i" with the
  // caller's own trigger (a chip, say), styled by the caller.
  let { label, button = null, children } = $props();
  const id = $props.id();
  let hover = $state(false), focus = $state(false), pinned = $state(false);
  const open = $derived(hover || focus || pinned);
  let btn = $state(null), panel = $state(null);
  let pos = $state({ top: 0, left: 0, width: 0 });

  const MARGIN = 12, WIDTH = 340;
  function place() {
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    // Right-aligned to the button where that fits, else pushed in from the edges.
    const left = Math.min(Math.max(MARGIN, r.right - width), window.innerWidth - MARGIN - width);
    pos = { top: r.bottom, left, width };
  }
  $effect(() => { if (open) place(); });
  const closeAll = () => { hover = false; focus = false; pinned = false; };
  // The tap is the trigger's own: a row behind it must not see it.
  const tap = (e) => { e.stopPropagation(); pinned = !pinned; if (!pinned) closeAll(); };
  const outside = (e) => { if (open && !btn?.contains(e.target) && !panel?.contains(e.target)) closeAll(); };
</script>

<svelte:window
  onresize={() => open && place()}
  onscrollcapture={() => open && place()}
  onkeydown={(e) => { if (e.key === 'Escape' && open) closeAll(); }}
  onpointerdown={outside}
/>

<!-- The panel starts where the button ends, so the pointer can cross from
     one to the other without the hover lapsing. -->
<span class={['info', { own: button }]}>
  <button bind:this={btn} type="button" class={button ? 'info-trigger' : 'info-btn'} aria-label={label} aria-expanded={open} aria-controls={id}
    onclick={tap} onfocus={() => (focus = true)} onblur={() => { focus = false; pinned = false; }}
    onmouseenter={() => (hover = true)} onmouseleave={() => (hover = false)}>{#if button}{@render button()}{:else}i{/if}</button>
  {#if open}
    <div bind:this={panel} {id} class="info-panel" role="tooltip" style:top="{pos.top}px" style:left="{pos.left}px" style:width="{pos.width}px"
      onmouseenter={() => (hover = true)} onmouseleave={() => (hover = false)}>
      <div class="info-card">{@render children()}</div>
    </div>
  {/if}
</span>

<style>
  .info { display: inline-block; vertical-align: middle; margin-left: 0.35rem; line-height: 0; }
  .info.own { margin-left: 0; }
  /* A caller's trigger: no chrome of its own, so the caller's styling shows through. */
  .info-trigger { background: none; border: 0; padding: 0; margin: 0; font: inherit; line-height: normal; color: inherit; cursor: help; text-align: inherit; }
  .info-trigger:focus-visible { outline: none; }
  .info-trigger:focus-visible :global(*), .info-trigger[aria-expanded="true"] :global(*) { border-color: var(--accent-ink); color: var(--accent-ink); }
  .info-btn {
    width: 1.05rem; height: 1.05rem; padding: 0; border-radius: 50%; cursor: help;
    border: 1px solid var(--muted); background: none; color: var(--muted);
    font-family: var(--display); font-weight: 600; font-size: 0.68rem; line-height: 1; text-transform: lowercase; letter-spacing: 0;
    transition: color 0.15s, border-color 0.15s;
  }
  .info-btn:hover, .info-btn:focus-visible, .info-btn[aria-expanded="true"] { color: var(--accent-ink); border-color: var(--accent-ink); outline: none; }
  /* Above the sticky header, below the driver modal. The top padding bridges
     the gap to the button so a hover survives the crossing. */
  .info-panel { position: fixed; z-index: 45; padding-top: 8px; text-align: left; }
  .info-card {
    background: var(--panel); color: var(--text); border: 1px solid var(--border); border-top: 1px solid var(--accent);
    border-radius: 4px; padding: 0.85rem 1rem 0.9rem; box-shadow: var(--shadow);
    font-family: var(--body); font-size: 0.86rem; line-height: 1.5; font-weight: 400;
    letter-spacing: normal; text-transform: none; white-space: normal;
  }
  .info-card :global(h4) {
    margin: 0 0 0.6rem; color: var(--accent-ink);
    font-family: var(--display); font-weight: 500; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.12em;
  }
  .info-card :global(p) { margin: 0 0 0.6rem; }
  .info-card :global(p:last-child) { margin-bottom: 0; }
</style>
