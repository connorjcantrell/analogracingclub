<script>
  import MediaStrip from '$lib/MediaStrip.svelte';
  import { driverName, eventTitle, eventMeta, resultsLink, roundTable } from '$lib/format.js';
  import { DISCORD_URL, IRACING_URL } from '$lib/links.js';

  let { data } = $props();

  // The latest race's top five on points. An unscored race (a single session
  // uploaded without a points format) is ordered by the deciding race's
  // finish instead, and the column says so.
  const latest = $derived(data.latest);
  const latestRows = $derived(latest ? roundTable(latest.sub).slice(0, data.top) : []);
  const scored = $derived(latestRows.some((r) => r.total !== 0));
  const finish = (r) => (r.feature?.finish ? `P${r.feature.finish}` : '—');
  // The race's cleanest driver (fewest incidents per lap, having completed
  // the race), named in the line under the sheet.
  const cleanest = $derived(data.cleanest);
  const incidentsText = (n) => `${n} ${n === 1 ? 'incident' : 'incidents'}`;

  const champ = $derived(data.championship);
  const standingsLink = $derived(champ ? `/standings?series=${encodeURIComponent(champ.series.slug)}` : '/standings');

  // The stake's top five this season, as the stake page orders them.
  const stake = $derived(data.stake);
  const stakeLink = $derived(stake ? `/stake?season=${encodeURIComponent(stake.season.slug)}` : '/stake');
  const pctText = (v) => `${v.toFixed(1)}%`;
  const racesText = (n) => `${n} ${n === 1 ? 'race' : 'races'}`;
  const arrow = (v) => (v > 0 ? '▲' : '▼');
</script>

<svelte:head>
  <title>Analog Racing Club</title>
</svelte:head>

<div class="home-grid">
  <!-- The latest race: its top five, its cleanest driver named beneath, and the link to the rest. -->
  <section class="home-card">
    <p class="sched-round">Latest result</p>
    {#if latest}
      <h2 class="card-title"><a href={resultsLink(latest.id)}>{eventTitle(latest)}</a></h2>
      <p class="card-sub">{eventMeta(latest)}</p>
      <div class="card-body">
        <table class="sheet">
          <thead><tr><th class="pos">Pos</th><th>Driver</th><th class="num">{scored ? 'Points' : 'Finish'}</th></tr></thead>
          <tbody>
            {#each latestRows as r, i (r.custId)}
              <tr><td class="pos">{i + 1}</td><td class="drv">{driverName(r.name)}</td><td class="num total">{scored ? r.total : finish(r)}</td></tr>
            {/each}
          </tbody>
        </table>
        {#if cleanest}
          <p class="card-note"><span class="note-label">Cleanest</span> {driverName(cleanest.name)} · {incidentsText(cleanest.incidents)}</p>
        {/if}
        <p class="card-more"><a class="link" href={resultsLink(latest.id)}>Full results →</a></p>
      </div>
    {:else}
      <p class="empty">No races run yet. Results appear after the first round.</p>
    {/if}
  </section>

  <!-- The championship: the current season's once it has raced, else the
       season before's; its top five after the rounds run so far. -->
  <section class="home-card">
    <p class="sched-round">Championship</p>
    {#if champ}
      <h2 class="card-title"><a href={standingsLink}>{champ.series.name}</a></h2>
      <p class="card-sub">After Round {champ.roundsRun} of {champ.roundsTotal}{champ.seasonName ? ` · ${champ.seasonName}` : ''}</p>
      <div class="card-body">
        <table class="sheet">
          <thead><tr><th class="pos">Pos</th><th>Driver</th><th class="num">Total</th></tr></thead>
          <tbody>
            {#each champ.standings as x, i (x.custId)}
              <tr>
                <td class="pos">{i + 1}{#if x.change}<span class={['chg', x.change > 0 ? 'chg-up' : 'chg-down']}>{x.change > 0 ? '▲' : '▼'}{Math.abs(x.change)}</span>{/if}</td>
                <td class="drv">{driverName(x.displayName)}</td>
                <td class="num total">{x.total}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="card-more"><a class="link" href={standingsLink}>Full standings →</a></p>
      </div>
    {:else}
      <p class="empty">No championship standings yet. They appear after the first round.</p>
    {/if}
  </section>

  <!-- Stake: the season's top five on steering weight, with the move since
       the last session. Drivers under the race minimum hold none. -->
  <section class="home-card">
    <p class="sched-round">Stake</p>
    {#if stake}
      <h2 class="card-title"><a href={stakeLink}>{stake.season.name}</a></h2>
      <p class="card-sub">After {racesText(stake.races)}</p>
      <div class="card-body">
        {#if stake.drivers.length}
          <table class="sheet">
            <thead><tr><th class="pos">Pos</th><th>Driver</th><th class="num">Stake</th></tr></thead>
            <tbody>
              {#each stake.drivers as x, i (x.custId)}
                <tr>
                  <td class="pos">{i + 1}{#if x.posChange}<span class={['chg', x.posChange > 0 ? 'chg-up' : 'chg-down']}>{arrow(x.posChange)}{Math.abs(x.posChange)}</span>{/if}</td>
                  <td class="drv">{driverName(x.displayName)}</td>
                  <td class="num total">{pctText(x.stake)}{#if x.change}<span class={['chg', x.change > 0 ? 'chg-up' : 'chg-down']}>{arrow(x.change)}{Math.abs(x.change).toFixed(1)}</span>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="empty">No one holds stake yet. It takes a few races to earn.</p>
        {/if}
        <p class="card-more"><a class="link" href={stakeLink}>Full stake →</a></p>
      </div>
    {:else}
      <p class="empty">No stake yet. It appears after the season's first race.</p>
    {/if}
  </section>
</div>

<!-- The newest race photos and videos, newest on the left. -->
{#if data.media.length}
  <section class="home-media">
    <div class="media-head">
      <p class="sched-round">From the track</p>
      <a class="link" href="/videos">All videos →</a>
    </div>
    <MediaStrip items={data.media} />
  </section>
{/if}

<!-- Where the club lives: the Discord, and iRacing itself. -->
<div class="home-links">
  <a class="btn mark-btn" href={DISCORD_URL} target="_blank" rel="noopener">
    <img class="on-dark" src="/assets/Discord-Symbol-White.svg" alt=""><img class="on-light" src="/assets/Discord-Symbol-Black.svg" alt="">
    <span>Join us on Discord</span>
  </a>
  <a class="btn mark-btn" href={IRACING_URL} target="_blank" rel="noopener">
    <img class="mark-mono" src="/assets/iracing.png" alt="">
    <span>Join iRacing</span>
  </a>
</div>

<style>
  /* Three cards in a row on a wide screen, stacked on a phone. Each is a
     label, a title, a line beneath, and a three-column sheet with a link on.
     The cards share the grid's rows (subgrid), so the sheets start on the
     same line whatever the titles above them wrap to. */
  .home-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 2.5rem; }
  .home-card { min-width: 0; display: grid; grid-template-rows: subgrid; grid-row: span 4; align-content: start; }
  .card-body { align-self: start; }
  .card-title { margin: 0.35rem 0 0.3rem; font-size: clamp(1.3rem, 2.4vw, 1.6rem); color: var(--text); line-height: 1.15; }
  .card-title a { color: inherit; text-decoration: none; }
  .card-title a:hover { color: var(--accent-ink); }
  .card-sub { margin: 0 0 1rem; color: var(--muted); font-size: 0.98rem; line-height: 1.5; }
  .card-more { margin: 1rem 0 0; font-size: 0.95rem; }
  /* The cleanest driver, under the sheet: their name and their count. */
  .card-note { margin: 0.7rem 0 0; color: var(--muted); font-size: 0.86rem; line-height: 1.45; }
  .note-label { font-family: var(--display); font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.72rem; margin-right: 0.15rem; }
  /* The media strip under the cards: its label and the link to every video on one line. */
  .home-media { padding: 3rem 0 0; }
  .media-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin: 0 0 1rem; }

  /* The sheet: the standings page's timing-sheet look at a smaller size. */
  .sheet { width: 100%; border-collapse: collapse; border-top: 1px solid var(--accent); }
  .sheet th {
    color: var(--muted); font-family: var(--display); font-weight: 500;
    font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.12em;
    text-align: left; padding: 0.6rem 0.6rem; border-bottom: 1px solid var(--rule-strong); white-space: nowrap;
  }
  .sheet td { padding: 0.5rem 0.6rem; border-bottom: var(--rule); color: var(--text); font-variant-numeric: tabular-nums; }
  .sheet tbody tr:last-child td { border-bottom: 0; }
  .sheet tbody tr:hover td { background: var(--hover); }
  .sheet .num { text-align: right; }
  .sheet th.pos, .sheet td.pos { width: 3rem; white-space: nowrap; }
  .sheet td.pos { font-family: var(--display); font-weight: 500; color: var(--muted); }
  .sheet td.drv { font-family: var(--display); font-weight: 500; letter-spacing: 0.02em; font-size: 1.05rem; }
  .sheet td.total { font-family: var(--display); font-weight: 600; font-size: 1.05rem; }
  .chg { margin-left: 0.4rem; font-size: 0.72rem; letter-spacing: 0.02em; font-weight: 500; }
  .chg-up { color: var(--green); }
  .chg-down { color: var(--red); }

  /* The two marks as buttons under the cards; each mark in the ground's colour. */
  .home-links { display: flex; flex-wrap: wrap; gap: 0.8rem; padding: 2.5rem 0 0; }
  .mark-btn { display: inline-flex; align-items: center; gap: 0.7rem; padding: 0.7rem 1.3rem 0.7rem 1.1rem; }
  .mark-btn img { height: 18px; width: auto; display: block; }
  .mark-btn img.on-dark { display: var(--on-dark); }
  .mark-btn img.on-light { display: var(--on-light); }
  .mark-btn img.mark-mono { filter: invert(var(--invert-on-light)); }

  /* A tablet fits two across; the third card takes the row beneath. */
  @media (max-width: 960px) {
    .home-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2.5rem; }
    .home-card { grid-template-rows: auto; grid-row: auto; }
  }
  @media (max-width: 640px) {
    .home-grid { grid-template-columns: 1fr; }
    /* The site's phone rule makes tables scrollable blocks; three columns
       fit, so the sheets stay real tables at full width, like the standings
       and stake pages. The driver column takes the slack and wraps a long name. */
    .sheet { display: table; width: 100%; }
    .sheet th, .sheet td { padding: 0.6rem 0.75rem; }
    .sheet td.drv { width: 100%; white-space: normal; }
    .sheet td.pos { white-space: nowrap; }
    .sheet td.total { white-space: nowrap; }
    .home-links { padding-top: 2rem; }
    .mark-btn { flex: 1 1 100%; justify-content: center; }
  }
</style>
