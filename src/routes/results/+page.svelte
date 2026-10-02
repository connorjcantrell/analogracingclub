<script>
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import PageTitle from '$lib/PageTitle.svelte';
  import Gallery from '$lib/Gallery.svelte';
  import VideoStrip from '$lib/VideoStrip.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import SessionTable from '$lib/SessionTable.svelte';
  import SummaryCards from '$lib/SummaryCards.svelte';
  import { fmtDate, trackName, sessionKindsOf, sessionLabel, SPECIAL_SLUG } from '$lib/format.js';

  let { data } = $props();
  // The series in view (a container, or the synthetic "Special events"
  // collection). Each event's layout comes from its own sub.eventType.
  const d = $derived(data.results);
  const oneOff = $derived(!!d?.series?.singleRound);

  // The events that have run, newest first — the dropdown's choices — and the
  // scheduled rounds still to come, listed after them for context.
  const epoch = (r) => new Date(r.subsessions[0]?.startTime ?? 0).getTime();
  const run = $derived((d?.rounds ?? []).filter((r) => r.subsessions.length).sort((a, b) => epoch(b) - epoch(a)));
  const upcoming = $derived((d?.rounds ?? []).filter((r) => !r.subsessions.length));

  // The event shown. The URL is the deep link: ?round=N for a league round,
  // ?event=<id> for a special; with neither, the most recent event.
  const sel = $derived.by(() => {
    if (!run.length) return null;
    const q = page.url.searchParams;
    const byId = q.get('event');
    const byRound = Number(q.get('round')) || null;
    return run.find((r) => r.subsessions[0]._id === byId)
      ?? (byRound != null ? run.find((r) => r.round === byRound) : null)
      ?? run[0];
  });
  // Choosing an event rewrites the URL (no reload — the page already holds
  // every event of the series), so the address bar is always shareable.
  function choose(e) {
    const r = run.find((x) => x.subsessions[0]._id === e.currentTarget.value);
    if (!r) return;
    const url = new URL(page.url);
    url.searchParams.set('series', data.pick.slug);
    url.searchParams.delete('round'); url.searchParams.delete('event');
    if (oneOff || r.round == null) url.searchParams.set('event', r.subsessions[0]._id);
    else url.searchParams.set('round', String(r.round));
    replaceState(url, {});
    view = 'overall';
  }

  let view = $state('overall');
  // Tabs are declared by the event's own type — strictly. A declared session
  // shows its tab even when a round skipped it (the table then shows a
  // placeholder), and "Overall" appears when the type combines >1 session.
  function viewsFor(type) {
    const kinds = sessionKindsOf(type);
    const overall = type?.display?.overall && kinds.length > 1;
    return (overall ? [['overall', 'Overall']] : []).concat(kinds.map((k) => [k, sessionLabel(type, k)]));
  }
  const optionLabel = (r) => {
    const sub = r.subsessions[0];
    return [
      oneOff ? null : `Round ${r.round}`,
      r.multiplier > 1 ? `${r.multiplier}×` : null,
      sub.title && oneOff ? sub.title : trackName(sub),
      fmtDate(sub.startTime),
    ].filter(Boolean).join(' · ');
  };
  const detailTitle = (r, sub) => [
    oneOff ? null : `Round ${r.round}`,
    r.multiplier > 1 ? `${r.multiplier}× points` : null,
    trackName(sub),
    sub.cars?.length ? sub.cars.join(' · ') : null,
  ].filter(Boolean).join(' · ');
  const EMPTY = 'No races run yet — results appear after the first round.';
</script>

<svelte:head><title>Results · Analog Racing Club</title></svelte:head>

<div class="page-head">
  <PageTitle inline>Results</PageTitle>
  <div><SeriesPicker containers={data.pick.containers} hasSpecial={data.pick.hasSpecial} value={data.pick.slug} /></div>
</div>
{#if !d}
  <p class="empty">{EMPTY}</p>
{:else}
  <p class="muted" id="seriesName">{d.series.name} · {d.series.typeLabel}</p>

  {#if !run.length}
    <p class="empty">{EMPTY}</p>
  {:else}
    <!-- Event picker: everything that has run, newest first; scheduled rounds
         still to come are listed, greyed, after them. -->
    <label class="event-pick-label">
      <span class="event-pick-caption">Event</span>
      <select class="series-pick event-pick" value={sel?.subsessions[0]._id} onchange={choose}>
        {#each run as r (r.subsessions[0]._id)}
          <option value={r.subsessions[0]._id}>{optionLabel(r)}</option>
        {/each}
        {#if upcoming.length}
          <optgroup label="Upcoming">
            {#each upcoming as r (`round:${r.round}`)}
              <option disabled>Round {r.round} · {r.track || 'TBD'} · {r.date || 'TBD'}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </label>
  {/if}

  {#if sel}
    {@const sub = sel.subsessions[0]}
    {@const mult = sel.multiplier || 1}
    {@const views = viewsFor(sub.eventType)}
    {@const active = views.some(([v]) => v === view) ? view : (views[0]?.[0] ?? 'overall')}
    <section class="event-detail">
      <h2 class="detail-title">{detailTitle(sel, sub)}</h2>
      <p class="lp-sub detail-date">{fmtDate(sub.startTime)}</p>
      <SummaryCards {sub} qualifyingPlaces={d.series?.qualifyingPlaces ?? 0} />
      <div class="tabs" role="tablist">
        {#each views as [v, title] (v)}
          <button class={['tab', { active: v === active }]} type="button" role="tab" aria-selected={v === active} onclick={() => (view = v)}>{title}</button>
        {/each}
      </div>
      {#if active === 'overall'}
        <OverallTable {sub} {mult} qualifyingPlaces={d.series?.qualifyingPlaces ?? 0} />
      {:else}
        <SessionTable {sub} kind={active} {mult} qualifyingPlaces={d.series?.qualifyingPlaces ?? 0} />
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
  {/if}
{/if}
