<script>
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import PageTitle from '$lib/PageTitle.svelte';
  import { driverName } from '$lib/format.js';

  let { data } = $props();
  const d = $derived(data.standings);
  // The Fast Four tally only means something for a Fast Four series.
  const isFastFour = $derived(!!d?.series?.eventType?.display?.cards?.includes('fast-four'));
  // Meta shown as broadcast chips beside the series name.
  const metaChips = $derived.by(() => {
    const s = d?.series;
    if (!s) return [];
    const out = [s.typeLabel];
    if ((s.dropCount ?? 0) > 0) out.push(`Drops ${s.dropCount} lowest`);
    return out;
  });
  // Share of a driver's rounds that put them in the Fast Four (qualified in
  // the paying places), as a whole percentage.
  const fastFourPct = (x) => (x.starts ? `${Math.round(100 * (x.fastFours ?? 0) / x.starts)}%` : '—');
  const EMPTY = 'No results yet — standings appear after the first round.';
</script>

<svelte:head><title>Standings · Analog Racing Club</title></svelte:head>

<div class="tv">
  <!-- Page title + season picker (picker only shows with more than one season). -->
  <div class="tv-head">
    <PageTitle inline>Standings</PageTitle>
    <div class="tv-pick"><SeriesPicker containers={data.pick.containers} hasSpecial={data.pick.hasSpecial} value={data.pick.slug} /></div>
  </div>

  {#if d}
    <div class="tv-meta">
      <span class="tv-series">{d.series.name}</span>
      {#each metaChips as c (c)}<span class="tv-chip">{c}</span>{/each}
    </div>
  {/if}

  {#if d?.standings.length}
    <div class="tv-board">
      <table class="tower">
        <thead>
          <tr>
            <th class="pos">Pos</th>
            <th class="drv">Driver</th>
            <th class="num" title="Rounds entered">Starts</th>
            <th class="num" title="Rounds won on the overall order">Wins</th>
            <th class="num" title="Rounds finished in the overall top 5">Top 5</th>
            <th class="num" title="Rounds finished in the overall top 10">Top 10</th>
            {#if isFastFour}<th class="num" title="Share of rounds qualified in the Fast Four">Fast Four %</th>{/if}
            <th class="num">Laps Led</th>
            <th class="num pts">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each d.standings as x, i (x.custId ?? x.displayName)}
            <tr>
              <td class="pos"><span class="pos-box">{i + 1}</span>{#if x.change}<span class={['chg', x.change > 0 ? 'chg-up' : 'chg-down']}>{x.change > 0 ? '▲' : '▼'}{Math.abs(x.change)}</span>{/if}</td>
              <td class="drv">{driverName(x.displayName)}</td>
              <td class="num">{x.starts ?? 0}</td>
              <td class="num">{x.wins ?? 0}</td>
              <td class="num">{x.top5 ?? 0}</td>
              <td class="num">{x.top10 ?? 0}</td>
              {#if isFastFour}<td class="num">{fastFourPct(x)}</td>{/if}
              <td class="num">{x.lapsLed ?? 0}</td>
              <td class="num total">{x.total}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="empty">{EMPTY}</p>
  {/if}

  <p class="format-note"><a class="link" href="/format">How the Fast Four format works →</a></p>
</div>

<style>
  /* ==========================================================================
     Standings — 90s motorsports broadcast pilot. Scoped to this page by Svelte;
     reuses the site tokens (amber accent, Oswald display) but pushes them into a
     timing-screen layout: slanted tags, a checker start-line, a numbered tower.
     ========================================================================== */

  /* ---- Title + season picker row ---- */
  .tv-head {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap; margin: 0;
  }
  .tv-pick { transform: skewX(-11deg); }
  .tv-pick :global(.series-pick) {
    transform: skewX(11deg); border: 1px solid var(--border);
    background: var(--panel); padding: 0.4rem 0.7rem;
  }
  .tv-pick :global(.series-pick:hover) { border-color: var(--accent); }

  /* ---- Series meta chips ---- */
  .tv-meta {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin: 1.1rem 0 1.5rem;
  }
  .tv-series {
    font-family: var(--display); font-weight: 600; font-style: italic;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--text);
    font-size: 1rem;
  }
  .tv-chip {
    font-family: var(--display); font-size: 0.68rem; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--accent);
    border: 1px solid var(--accent); padding: 0.12rem 0.55rem;
    transform: skewX(-11deg);
  }

  /* ---- Timing tower table ---- */
  .tv-board { overflow-x: auto; border-top: 2px solid var(--accent); }
  table.tower { width: 100%; border-collapse: collapse; }
  table.tower thead th {
    background: #0c0c0c; color: var(--accent);
    font-family: var(--display); font-weight: 500;
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.18em;
    text-align: left; padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  table.tower thead th.num { text-align: right; }
  table.tower thead th .round-link { color: inherit; text-decoration: none; }
  table.tower thead th .round-link:hover { color: var(--accent-soft); }

  table.tower td {
    padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border);
    color: var(--text); font-variant-numeric: tabular-nums;
  }
  table.tower td.num { text-align: right; }
  table.tower td.drv {
    font-family: var(--display); font-weight: 500; letter-spacing: 0.02em;
    font-size: 1.02rem;
  }
  table.tower tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.018); }
  table.tower tbody tr:hover td { background: var(--accent-dim); color: var(--accent-soft); }

  /* Boxed, slanted position number — the timing-screen signature. */
  td.pos { width: 3.3rem; }
  .pos-box {
    display: inline-block; min-width: 1.75rem; text-align: center;
    font-family: var(--display); font-weight: 700; font-style: italic;
    font-size: 0.95rem; font-variant-numeric: tabular-nums;
    padding: 0.05rem 0.35rem; transform: skewX(-11deg);
    background: var(--panel); border: 1px solid var(--border); color: var(--muted);
  }

  td.total {
    font-family: var(--display); font-weight: 700; font-style: italic;
    color: var(--accent); font-size: 1.05rem;
  }
  td.dropped { color: var(--muted); text-decoration: line-through; }
  td.muted { color: var(--muted); }

  /* ---- Link out to the format page ---- */
  .format-note { margin: 2rem 0 0; font-size: 0.98rem; }

  @media (max-width: 640px) {
    table.tower th, table.tower td { white-space: nowrap; }
  }
</style>
