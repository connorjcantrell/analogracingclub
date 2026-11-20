<script>
  import { goto } from '$app/navigation';
  import PageTitle from '$lib/PageTitle.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import { eventTitle, eventMeta, resultsLink } from '$lib/format.js';

  let { data } = $props();
  // Every race the club has run, newest first — or one season's, when the
  // picker names one (?season=). Each shows its top ten on points and links
  // to its own page for the rest.
  const d = $derived(data.results);
  const seasonName = $derived(d.seasons.find((s) => s.slug === d.season)?.name ?? null);
  const TOP = 10;

  // The three kinds of race can each be hidden; the count is what the list
  // holds for the season in view.
  let hidden = $state(new Set());
  const toggleKind = (id) => { const n = new Set(hidden); n.has(id) ? n.delete(id) : n.add(id); hidden = n; };
  const counts = $derived(Object.fromEntries(d.kinds.map((k) => [k.id, d.events.filter((e) => e.kind === k.id).length])));
  const shown = $derived(d.events.filter((e) => !hidden.has(e.kind)));
  // Scheduled rounds still to come close the list — they are league
  // sessions, so they hide with that kind.
  const upcoming = $derived(hidden.has('league') ? [] : d.upcoming);

  // A season re-runs the load.
  function pickSeason(e) {
    const v = e.currentTarget.value;
    goto(v ? `?season=${encodeURIComponent(v)}` : '/results', { replaceState: true, noScroll: true, keepFocus: true });
  }
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
  {/if}

  <div class="result-list">
    {#each shown as ev (ev.id)}
      <article class="result-item">
        <h2 class="event-title"><a href={resultsLink(ev.id)}>{eventTitle(ev)}</a></h2>
        <p class="lp-sub event-meta">{eventMeta(ev)}</p>
        <OverallTable sub={ev.sub} mult={ev.multiplier} limit={TOP} qualifyingPlaces={ev.qualifyingPlaces} />
        <p class="result-more"><a class="link" href={resultsLink(ev.id)}>Full results →</a></p>
      </article>
    {/each}
  </div>

  {#if upcoming.length}
    <section class="upcoming">
      <h3 class="section-title">Upcoming</h3>
      <ul>
        {#each upcoming as r (`${r.seriesSlug}:${r.round}`)}
          <li>{r.date || 'TBD'} · Round {r.round} · {r.track || 'TBD'}{d.season ? '' : ` · ${r.seriesName}`}</li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}
