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
  const EMPTY = 'No results yet. Standings appear after the first round.';

  // On a phone the sheet shows position, driver and total; tapping a row
  // opens the rest of its columns beneath it. Wide screens show every column
  // and ignore the toggle.
  let open = $state(new Set());
  const toggle = (id) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); open = n; };
  const rowId = (x) => x.custId ?? x.displayName;
  const detail = (x) => [
    ['Starts', x.starts ?? 0],
    ...(isFastFour ? [['Fast Four', fastFourPct(x)]] : []),
    ['Top 10', x.top10 ?? 0],
    ['Top 5', x.top5 ?? 0],
    ['Wins', x.wins ?? 0],
    ['Laps led', x.lapsLed ?? 0],
  ];
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
            <th class="num more" title="Rounds entered">Starts</th>
            {#if isFastFour}<th class="num more" title="Share of rounds qualified in the Fast Four">Fast Four %</th>{/if}
            <th class="num more" title="Rounds finished in the overall top 10">Top 10</th>
            <th class="num more" title="Rounds finished in the overall top 5">Top 5</th>
            <th class="num more" title="Rounds won on the overall order">Wins</th>
            <th class="num more">Laps Led</th>
            <th class="num pts">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each d.standings as x, i (rowId(x))}
            {@const isOpen = open.has(rowId(x))}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <tr class={['sheet-row', { open: isOpen }]} onclick={() => toggle(rowId(x))}>
              <td class="pos"><span class="pos-box">{i + 1}</span>{#if x.change}<span class={['chg', x.change > 0 ? 'chg-up' : 'chg-down']}>{x.change > 0 ? '▲' : '▼'}{Math.abs(x.change)}</span>{/if}</td>
              <td class="drv">{driverName(x.displayName)}</td>
              <td class="num more">{x.starts ?? 0}</td>
              {#if isFastFour}<td class="num more">{fastFourPct(x)}</td>{/if}
              <td class="num more">{x.top10 ?? 0}</td>
              <td class="num more">{x.top5 ?? 0}</td>
              <td class="num more">{x.wins ?? 0}</td>
              <td class="num more">{x.lapsLed ?? 0}</td>
              <td class="num total">{x.total}</td>
            </tr>
            {#if isOpen}
              <tr class="detail">
                <td colspan="3">
                  <dl>
                    {#each detail(x) as [k, v] (k)}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
                  </dl>
                </td>
              </tr>
            {/if}
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
  /* Standings: a timing sheet. Site tokens, hairline rules, tabular figures;
     amber only on the sheet's top rule and the total column. */

  /* ---- Title + season picker row ---- */
  .tv-head {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 1rem; flex-wrap: wrap; margin: 0;
  }

  /* ---- Series line + meta ---- */
  .tv-meta {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin: 1rem 0 1.6rem;
  }
  .tv-series {
    font-family: var(--display); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text);
    font-size: 1.05rem;
  }
  .tv-chip {
    font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted);
    border: 1px solid var(--border); border-radius: var(--radius); padding: 0.15rem 0.55rem;
  }

  /* ---- The sheet ---- */
  .tv-board { overflow-x: auto; border-top: 1px solid var(--accent); }
  table.tower { width: 100%; border-collapse: collapse; }
  table.tower thead th {
    color: var(--muted); font-family: var(--display); font-weight: 500;
    font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.12em;
    text-align: left; padding: 0.7rem 0.75rem;
    border-bottom: 1px solid var(--rule-strong); white-space: nowrap;
  }
  table.tower thead th.num { text-align: right; }
  table.tower thead th .round-link { color: inherit; text-decoration: none; }
  table.tower thead th .round-link:hover { color: var(--text); }

  table.tower td {
    padding: 0.6rem 0.75rem; border-bottom: var(--rule);
    color: var(--text); font-variant-numeric: tabular-nums;
  }
  table.tower td.num { text-align: right; }
  table.tower tbody tr:last-child td { border-bottom: 0; }
  table.tower td.drv {
    font-family: var(--display); font-weight: 500; letter-spacing: 0.02em;
    font-size: 1.1rem;
  }
  table.tower tbody tr:hover td { background: rgba(255, 255, 255, 0.025); }

  td.pos { width: 3rem; }
  .pos-box {
    display: inline-block; min-width: 1.5rem;
    font-family: var(--display); font-weight: 500; font-size: 1rem;
    font-variant-numeric: tabular-nums; color: var(--muted);
  }
  tbody tr:hover .pos-box { color: var(--text); }

  td.total {
    font-family: var(--display); font-weight: 600;
    color: var(--accent); font-size: 1.1rem;
  }
  td.dropped { color: var(--muted); text-decoration: line-through; }
  td.muted { color: var(--muted); }

  /* ---- Link out to the format page ---- */
  .format-note { margin: 2rem 0 0; font-size: 0.98rem; }

  /* ---- Phone: three columns, tap a row for the rest ---- */
  tr.detail { display: none; }
  @media (max-width: 640px) {
    table.tower th, table.tower td { white-space: nowrap; }
    /* The site's phone rule makes tables scrollable blocks; three columns fit,
       so this one stays a real table at full width. */
    table.tower { display: table; width: 100%; }
    table.tower .more { display: none; }
    table.tower td.drv { width: 100%; }
    tr.sheet-row { cursor: pointer; }
    tr.sheet-row:hover td { background: none; }
    tr.sheet-row.open td { border-bottom: 0; }
    tr.detail { display: table-row; }
    tr.detail td { padding: 0 0.75rem 0.9rem; }
    tr.detail dl {
      margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem 1rem;
      padding: 0.7rem 0 0; border-top: 1px dashed var(--border);
    }
    tr.detail dl div { display: grid; gap: 0.1rem; }
    tr.detail dt { font-family: var(--display); color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.1em; }
    tr.detail dd { margin: 0; font-family: var(--display); font-weight: 500; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  }
</style>
