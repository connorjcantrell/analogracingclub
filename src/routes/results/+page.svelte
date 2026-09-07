<script>
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import Gallery from '$lib/Gallery.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import SessionTable from '$lib/SessionTable.svelte';
  import SummaryCards from '$lib/SummaryCards.svelte';
  import { fmtDate, trackName, winner, overallWinner, sessionKindsOf, sessionLabel } from '$lib/format.js';

  let { data } = $props();
  // The series in view (a container, or the synthetic "Special events"
  // collection). Each event's layout comes from its own sub.eventType.
  const d = $derived(data.results);
  // A single-round competition (or the specials list) has no round number.
  // The winner columns follow the events' type; a container is homogeneous,
  // so the first event that ran is representative. Pole only means something
  // when the type runs a qualifying session.
  const oneOff = $derived(!!d?.series?.singleRound);
  const et = $derived(d?.rounds.map((r) => r.subsessions[0]).find(Boolean)?.eventType);
  const single = $derived(sessionKindsOf(et).length <= 1);
  const hasQual = $derived(sessionKindsOf(et).includes('qualifying'));

  // The round being shown, keyed by its stored result so switching series
  // clears it. A ?round= deep link picks the round on first render.
  let selectedId = $state(null);
  let view = $state('overall');
  let detail = $state(null);
  const sel = $derived.by(() => {
    if (!d) return null;
    const chosen = d.rounds.find((r) => r.subsessions[0]?._id === selectedId);
    if (chosen) return chosen;
    const want = Number(page.url.searchParams.get('round')) || null;
    return want != null ? d.rounds.find((r) => r.round === want && r.subsessions.length) ?? null : null;
  });

  async function pick(r) {
    selectedId = r.subsessions[0]._id;
    await tick();
    detail?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Tabs are declared by the event's own type — strictly. A declared session
  // shows its tab even when a round skipped it (the table then shows a
  // placeholder), and "Overall" appears when the type combines >1 session.
  function viewsFor(type) {
    const kinds = sessionKindsOf(type);
    const overall = type?.display?.overall && kinds.length > 1;
    return (overall ? [['overall', 'Overall']] : []).concat(kinds.map((k) => [k, sessionLabel(type, k)]));
  }
  const rowKey = (r) => r.subsessions[0]?._id ?? `round:${r.round}`;
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
  <h2>Results</h2>
  <div><SeriesPicker containers={data.pick.containers} hasSpecial={data.pick.hasSpecial} value={data.pick.slug} /></div>
</div>
{#if !d}
  <p class="empty">{EMPTY}</p>
{:else}
  <p class="muted" id="seriesName">{d.series.name} · {d.series.typeLabel}</p>
  <table>
    <thead>
      <tr>
        {#if !oneOff}<th>Round</th>{/if}
        <th>Track</th>
        <th>Date</th>
        {#if hasQual}<th>Fast qualifier</th>{/if}
        {#if !single}<th>{sessionLabel(et, 'feature')} winner</th>{/if}
        <th>{single ? 'Winner' : 'Overall winner'}</th>
      </tr>
    </thead>
    <tbody>
      {#each d.rounds as r (rowKey(r))}
        {@const sub = r.subsessions[0]}
        {@const track = sub ? trackName(sub) : r.track}
        <tr style:cursor={sub ? 'pointer' : null} onclick={() => sub && pick(r)}>
          {#if !oneOff}
            <td class="pos">{r.round ?? ''}{#if r.multiplier > 1}<span class="mult-badge">{r.multiplier}×</span>{/if}</td>
          {/if}
          <td class={{ muted: !track }}>
            <span class="track-name">{track || '—'}</span>
            {#if sub?.cars?.length}<span class="track-cars">{sub.cars.join(' · ')}</span>{/if}
          </td>
          <td class={{ muted: !sub }}>{sub ? fmtDate(sub.startTime) : r.date || 'TBD'}</td>
          {#if hasQual}<td class={{ muted: !sub }}>{winner(sub, 'qualifying') || '—'}</td>{/if}
          {#if !single}<td class={{ muted: !sub }}>{winner(sub, 'feature') || '—'}</td>{/if}
          <td class={{ muted: !sub }}>{overallWinner(sub) || '—'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if !d.rounds.some((r) => r.subsessions.length)}
    <p class="empty">{EMPTY}</p>
  {/if}

  {#if sel}
    {@const sub = sel.subsessions[0]}
    {@const mult = sel.multiplier || 1}
    {@const views = viewsFor(sub.eventType)}
    {@const active = views.some(([v]) => v === view) ? view : (views[0]?.[0] ?? 'overall')}
    <section bind:this={detail}>
      <h2 class="detail-title">{detailTitle(sel, sub)}</h2>
      <SummaryCards {sub} qualifyingPlaces={d.series?.qualifyingPlaces ?? 0} />
      <div class="tabs" role="tablist">
        {#each views as [v, title] (v)}
          <button class={['tab', { active: v === active }]} type="button" role="tab" aria-selected={v === active} onclick={() => (view = v)}>{title}</button>
        {/each}
      </div>
      {#if active === 'overall'}
        <OverallTable {sub} {mult} />
      {:else}
        <SessionTable {sub} kind={active} {mult} />
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
