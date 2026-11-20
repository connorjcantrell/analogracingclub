<script>
  import Gallery from '$lib/Gallery.svelte';
  import VideoStrip from '$lib/VideoStrip.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import SessionTable from '$lib/SessionTable.svelte';
  import SummaryCards from '$lib/SummaryCards.svelte';
  import { sessionKindsOf, sessionLabel, eventTitle, eventMeta } from '$lib/format.js';

  // One event in full: its summary, a tab per session the event type
  // declares (plus Overall when it combines more than one), videos, photos.
  let { data } = $props();
  const ev = $derived(data.event);
  const sub = $derived(ev.sub);
  // Back to the list, narrowed to this event's season when it has one.
  const backHref = $derived(ev.season ? `/results?season=${encodeURIComponent(ev.season)}` : '/results');

  let view = $state('overall');
  // A declared session shows its tab even when the event skipped it (the
  // table then shows a placeholder).
  const views = $derived.by(() => {
    const type = sub.eventType;
    const kinds = sessionKindsOf(type);
    const overall = type?.display?.overall && kinds.length > 1;
    return (overall ? [['overall', 'Overall']] : []).concat(kinds.map((k) => [k, sessionLabel(type, k)]));
  });
  const active = $derived(views.some(([v]) => v === view) ? view : (views[0]?.[0] ?? 'overall'));
</script>

<svelte:head><title>{eventTitle(ev)} · Results · Analog Racing Club</title></svelte:head>

<p class="crumb"><a class="link" href={backHref}>← Results{ev.seasonName ? ` · ${ev.seasonName}` : ''}</a></p>
<section class="event-page">
  <h2 class="event-title">{eventTitle(ev)}</h2>
  <p class="lp-sub event-meta">{eventMeta(ev)}</p>
  <SummaryCards {sub} qualifyingPlaces={ev.qualifyingPlaces} />
  <div class="tabs" role="tablist">
    {#each views as [v, title] (v)}
      <button class={['tab', { active: v === active }]} type="button" role="tab" aria-selected={v === active} onclick={() => (view = v)}>{title}</button>
    {/each}
  </div>
  {#if active === 'overall'}
    <OverallTable {sub} mult={ev.multiplier} qualifyingPlaces={ev.qualifyingPlaces} />
  {:else}
    <SessionTable {sub} kind={active} mult={ev.multiplier} qualifyingPlaces={ev.qualifyingPlaces} />
  {/if}
  {#if sub.videos?.length}
    <div class="gallery-section">
      <h3 class="gallery-title">Videos</h3>
      <VideoStrip videos={sub.videos} />
    </div>
  {/if}
  {#if sub.images?.length}
    <div class="gallery-section">
      <h3 class="gallery-title">Photos</h3>
      <Gallery images={sub.images} />
    </div>
  {/if}
</section>
