<script>
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import PageTitle from '$lib/PageTitle.svelte';
  import Gallery from '$lib/Gallery.svelte';
  import VideoStrip from '$lib/VideoStrip.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import SessionTable from '$lib/SessionTable.svelte';
  import SummaryCards from '$lib/SummaryCards.svelte';
  import { fmtDate, trackName, sessionKindsOf, sessionLabel } from '$lib/format.js';

  let { data } = $props();
  // Every race the club has run, newest first — or one season's, when the
  // picker names one (?season=). Each event's layout comes from its own
  // sub.eventType.
  const d = $derived(data.results);
  const seasonName = $derived(d.seasons.find((s) => s.slug === d.season)?.name ?? null);

  // The three kinds of race can each be hidden; the count is what the list
  // holds for the season in view.
  let hidden = $state(new Set());
  const toggleKind = (id) => { const n = new Set(hidden); n.has(id) ? n.delete(id) : n.add(id); hidden = n; };
  const counts = $derived(Object.fromEntries(d.kinds.map((k) => [k.id, d.events.filter((e) => e.kind === k.id).length])));
  const kindLabel = (id) => d.kinds.find((k) => k.id === id)?.label ?? id;
  const shown = $derived(d.events.filter((e) => !hidden.has(e.kind)));
  // Scheduled rounds still to come are listed, greyed, after the races that
  // have run — they are league sessions, so they hide with that kind.
  const upcoming = $derived(hidden.has('league') ? [] : d.upcoming);

  // The event shown. The URL is the deep link (?event=<id>; the older
  // ?series=&round= form still resolves); with neither, the most recent.
  const sel = $derived.by(() => {
    if (!shown.length) return null;
    const q = page.url.searchParams;
    const byId = q.get('event');
    const series = q.get('series'), round = Number(q.get('round')) || null;
    return shown.find((e) => e.id === byId)
      ?? (series && round ? shown.find((e) => e.seriesSlug === series && e.round === round) : null)
      ?? shown[0];
  });
  // Choosing an event rewrites the URL (no reload — the page already holds
  // every event in view), so the address bar is always shareable.
  function choose(e) {
    const url = new URL(page.url);
    url.searchParams.set('event', e.currentTarget.value);
    url.searchParams.delete('series'); url.searchParams.delete('round');
    replaceState(url, {});
    view = 'overall';
  }
  // A season re-runs the load; the event selection resets with it.
  function pickSeason(e) {
    const v = e.currentTarget.value;
    goto(v ? `?season=${encodeURIComponent(v)}` : '/results', { replaceState: true, noScroll: true, keepFocus: true });
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
  // What an event is called: a league round by its round and track (and its
  // series, when the list spans seasons); a standalone by its title.
  const eventName = (ev) => (ev.kind === 'league'
    ? [`Round ${ev.round}`, ev.multiplier > 1 ? `${ev.multiplier}×` : null, trackName(ev.sub)].filter(Boolean).join(' · ')
    : ev.sub.title || trackName(ev.sub));
  // The list is chronological, so the date leads each option (a phone's
  // ellipsis then trims the end, never the date).
  const optionLabel = (ev) => [
    fmtDate(ev.startTime),
    ev.kind === 'single' ? 'Single session' : ev.kind === 'special' ? 'Special event' : null,
    eventName(ev),
    ev.kind === 'league' && !d.season ? ev.seriesName : null,
  ].filter(Boolean).join(' · ');
  const detailMeta = (ev) => [
    fmtDate(ev.startTime),
    ev.kind === 'league' ? ev.seriesName : kindLabel(ev.kind).replace(/s$/, ''),
    ev.multiplier > 1 ? `${ev.multiplier}× points` : null,
    ev.sub.cars?.length ? ev.sub.cars.join(' · ') : null,
  ].filter(Boolean).join(' · ');
  const EMPTY = $derived(seasonName ? `No races run in ${seasonName} yet.` : 'No races run yet. Results appear after the first round.');
</script>

<svelte:head><title>Results · Analog Racing Club</title></svelte:head>

<div class="page-head">
  <PageTitle inline>Results</PageTitle>
  {#if d.seasons.length}
    <div>
      <select class="series-pick" value={d.season ?? ''} onchange={pickSeason} aria-label="Season">
        <option value="">All seasons</option>
        {#each d.seasons as s (s.slug)}<option value={s.slug}>{s.name}</option>{/each}
      </select>
    </div>
  {/if}
</div>

{#if !d.events.length}
  <p class="empty">{EMPTY}</p>
{:else}
  <div class="kind-filter" role="group" aria-label="Kinds of race">
    {#each d.kinds as k (k.id)}
      <button type="button" class={['kind-chip', { off: hidden.has(k.id) }]} aria-pressed={!hidden.has(k.id)} onclick={() => toggleKind(k.id)}>
        {k.label}<span class="n">{counts[k.id]}</span>
      </button>
    {/each}
  </div>

  {#if !shown.length}
    <p class="empty">Every kind is hidden. Turn one back on to see its races.</p>
  {:else}
    <!-- Event picker: everything in view, newest first; scheduled rounds
         still to come are listed, greyed, after them. -->
    <label class="event-pick-label">
      <span class="event-pick-caption">Event</span>
      <select class="series-pick event-pick" value={sel?.id} onchange={choose}>
        {#each shown as ev (ev.id)}
          <option value={ev.id}>{optionLabel(ev)}</option>
        {/each}
        {#if upcoming.length}
          <optgroup label="Upcoming">
            {#each upcoming as r (`${r.seriesSlug}:${r.round}`)}
              <option disabled>{r.date || 'TBD'} · Round {r.round} · {r.track || 'TBD'}{d.season ? '' : ` · ${r.seriesName}`}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </label>
  {/if}

  {#if sel}
    {@const sub = sel.sub}
    {@const views = viewsFor(sub.eventType)}
    {@const active = views.some(([v]) => v === view) ? view : (views[0]?.[0] ?? 'overall')}
    <section class="event-detail">
      <h2 class="detail-title">{eventName(sel)}</h2>
      <p class="lp-sub detail-date">{detailMeta(sel)}</p>
      <SummaryCards {sub} qualifyingPlaces={sel.qualifyingPlaces} />
      <div class="tabs" role="tablist">
        {#each views as [v, title] (v)}
          <button class={['tab', { active: v === active }]} type="button" role="tab" aria-selected={v === active} onclick={() => (view = v)}>{title}</button>
        {/each}
      </div>
      {#if active === 'overall'}
        <OverallTable {sub} mult={sel.multiplier} qualifyingPlaces={sel.qualifyingPlaces} />
      {:else}
        <SessionTable {sub} kind={active} mult={sel.multiplier} qualifyingPlaces={sel.qualifyingPlaces} />
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
