<script>
  import Carousel from '$lib/Carousel.svelte';
  import Gallery from '$lib/Gallery.svelte';
  import OverallTable from '$lib/OverallTable.svelte';
  import SessionTable from '$lib/SessionTable.svelte';
  import SummaryCards from '$lib/SummaryCards.svelte';
  import { fmtDate, trackName, SPECIAL_SLUG } from '$lib/format.js';

  let { data } = $props();
  const latest = $derived(data.latest);

  const SCHEDULE = [
    { round: 1, date: '9/17', track: 'Lime Rock', config: 'Classic', rsvp: 'https://discord.com/events/1515054726276976650/1537464221988556871' },
    { round: 2, date: '9/24', track: 'Sebring', config: 'Club' },
    { round: 3, date: '10/1', track: 'New Hampshire', config: 'Road Course B' },
    { round: 4, date: '10/8', track: 'Belle Isle' },
    { round: 5, date: '10/15', track: 'Road America' },
    { round: 6, date: '10/22', track: 'Knockhill', config: 'Reverse' },
  ];

  // A single-round competition (a one-off) has no round number to show.
  const kicker = (series, sub) => (series
    ? [series.typeLabel, series.name, series.singleRound || sub.round == null ? null : `Round ${sub.round}`].filter(Boolean).join(' · ')
    : 'Special event');
  const resultsLink = (series, sub) => (series
    ? `/results?series=${encodeURIComponent(series.slug)}&round=${sub.round ?? ''}`
    : `/results?series=${encodeURIComponent(SPECIAL_SLUG)}`);
</script>

<svelte:head>
  <title>Analog Racing Club</title>
  <meta name="description" content="Analog Racing Club — an iRacing league.">
</svelte:head>

<section class="lp-section" id="season2">
  <p class="sched-round">Season 2 · Starts Thursday 9/17</p>
  <h2 class="lp-h">Season 2 kicks off Thursday 9/17 in the Euro NASCAR</h2>
  <p class="lp-sub">For those new to Analog Racing Club: Season 1 was with the Euro NASCAR in intermittent weather. We had enough fun with it that everyone wanted another season in the same car, this time across 6 tracks, each picked by a different one of last season's most active drivers.</p>

  <!-- No race photos yet: the schedule takes the full width. -->
  <div class={['season-layout', { 'no-photos': !data.photos.length }]}>
    {#if data.photos.length}<Carousel photos={data.photos} />{/if}
    <div class="season-schedule">
      {#each SCHEDULE as r (r.round)}
        <div class="sched-card">
          <p class="sched-round">R{r.round} · {r.date}</p>
          <span class="sched-track">{r.track}</span>
          {#if r.config || r.rsvp}
            <p class="sched-config">{r.config}{#if r.rsvp} · <a class="link" href={r.rsvp} target="_blank" rel="noopener">RSVP on Discord →</a>{/if}</p>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <p class="latest-more" style="margin-bottom:0"><a class="link" href="/standings">See the points format →</a></p>
</section>

<section class="lp-section" id="latest">
  {#if !latest}
    <p class="sched-round">Latest event</p>
    <h2 class="lp-h">No events yet</h2>
    <p class="lp-sub">The first result will show up here as soon as it's run.</p>
  {:else}
    {@const { series, subsession: sub } = latest}
    {@const track = trackName(sub)}
    {@const hero = sub.featuredImage || sub.images?.[0]?.url}
    <p class="sched-round">{kicker(series, sub)}</p>
    <!-- A special event is named (e.g. "87s in Detroit"); the track then moves
         to the subline. A league round is known by its track. -->
    <h2 class="lp-h">{sub.title || track || 'Latest event'}</h2>
    <p class="lp-sub">{[sub.title ? track : null, fmtDate(sub.startTime)].filter(Boolean).join(' · ')}</p>
    {#if hero}
      <figure class="hero-shot"><img src={hero} alt={sub.title || track || ''}></figure>
    {/if}
    <SummaryCards {sub} qualifyingPlaces={series?.qualifyingPlaces ?? 0} overall />
    <div class="latest-table">
      {#if series}
        <!-- League round: points across the round. -->
        <OverallTable {sub} limit={10} />
      {:else}
        <!-- Special event: the race itself, in finishing order. -->
        <SessionTable {sub} kind="feature" limit={10} />
      {/if}
      <!-- A one-off special has no championship, so don't promise standings. -->
      <p class="latest-more"><a class="link" href={resultsLink(series, sub)}>{series ? 'Full results and standings →' : 'Full results →'}</a></p>
    </div>
    {#if sub.images?.length}
      <div class="gallery-section">
        <h3 class="gallery-title">Photos</h3>
        <Gallery images={sub.images} />
      </div>
    {/if}
  {/if}
</section>
