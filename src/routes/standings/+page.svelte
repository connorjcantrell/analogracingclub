<script>
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import PageTitle from '$lib/PageTitle.svelte';
  import { driverName, signed } from '$lib/format.js';

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
            {#if isFastFour}<th class="num">Fast Four</th>{/if}
            <th class="num">Positions Gained</th>
            <th class="num">Laps Led</th>
            <th class="num pts">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each d.standings as x, i (x.custId ?? x.displayName)}
            <tr>
              <td class="pos"><span class="pos-box">{i + 1}</span>{#if x.change}<span class={['chg', x.change > 0 ? 'chg-up' : 'chg-down']}>{x.change > 0 ? '▲' : '▼'}{Math.abs(x.change)}</span>{/if}</td>
              <td class="drv">{driverName(x.displayName)}</td>
              {#if isFastFour}<td class="num">{x.fastFours ?? 0}</td>{/if}
              <td class="num">{signed(x.positionsGained)}</td>
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

  <section class="format-note">
    <h3><span>Fast Four · Format</span></h3>
    <p class="format-lead">Each round is three sessions: <strong>Open Qualifying</strong> (10 min), a <strong>Heat Race</strong> (10 min), and the <strong>Feature</strong> (30 min).</p>
    <p class="format-lead">The Heat grid is set by <strong>inverting the top eight qualifiers</strong>: the fastest four are sent to the back of that group, so P1 starts 8th, P2 starts 7th, and so on. Those &ldquo;Fast Four&rdquo; earn bonus points equal to the positions they gave up. The top qualifier drops from 1st to 8th, seven positions, and so gets 7 bonus points.</p>

    <div class="format-grid">
      <div class="format-block">
        <h4>Qualifying</h4>
        <table class="format-table">
          <thead><tr><th>Qualified</th><th>Heat start</th><th class="num">Points</th></tr></thead>
          <tbody>
            <tr><td><span class="pos-chip">P1</span></td><td>P8</td><td class="num">7</td></tr>
            <tr><td><span class="pos-chip">P2</span></td><td>P7</td><td class="num">5</td></tr>
            <tr><td><span class="pos-chip">P3</span></td><td>P6</td><td class="num">3</td></tr>
            <tr><td><span class="pos-chip">P4</span></td><td>P5</td><td class="num">1</td></tr>
          </tbody>
        </table>
      </div>

      <div class="format-block">
        <h4>Heat</h4>
        <p class="format-lead">Your finishing position in the Heat is your starting position in the Feature.</p>
      </div>

      <div class="format-block">
        <h4>Feature</h4>
        <table class="format-table">
          <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
          <tbody>
            <tr><td>1st</td><td class="num">20</td></tr>
            <tr><td>2nd</td><td class="num">18</td></tr>
            <tr><td>3rd</td><td class="num">16</td></tr>
            <tr><td>4th</td><td class="num">14</td></tr>
            <tr><td>5th</td><td class="num">12</td></tr>
            <tr><td>6th–16th</td><td class="num">11 → 1</td></tr>
          </tbody>
        </table>
        <p class="format-lead">The winner of the Feature isn't necessarily the winner of the round. To win a round, you'll need to qualify in the Fast Four and work your way back to the front.</p>
      </div>
    </div>

    <p class="format-lead"><strong>+1 pt for leading a lap</strong> in either the Heat or the Feature. It's awarded once per round, so leading in both races still earns a single point.</p>
  </section>
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

  /* ---- Format section as a spec sheet ---- */
  .format-note { margin: 3rem 0 0; padding-top: 1.6rem; border-top: 2px solid var(--accent); }
  .format-note h3 { margin: 0 0 1rem; }
  .format-note h3 span {
    display: inline-block; background: var(--accent); color: var(--on-accent);
    font-family: var(--display); font-weight: 700; font-style: italic;
    text-transform: uppercase; letter-spacing: 0.04em; font-size: 1.05rem;
    padding: 0.2rem 0.9rem; transform: skewX(-11deg);
  }
  .format-lead { color: var(--text); font-size: 0.98rem; line-height: 1.55; margin: 0 0 0.6rem; max-width: 52ch; }
  .format-note > .format-lead { max-width: none; }
  .format-lead strong { color: var(--accent); font-weight: 500; }

  .format-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem; align-items: start; margin: 1.9rem 0;
  }
  .format-block {
    border: 1px solid var(--border); background: rgba(255, 255, 255, 0.015);
    padding: 0 1.1rem 1.1rem;
  }
  .format-block h4 {
    margin: 0 -1.1rem 1rem; padding: 0.45rem 1.1rem;
    background: #0c0c0c; color: var(--accent);
    font-family: var(--display); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  .format-block .format-lead { margin-bottom: 0; }
  .format-table { width: 100%; border-collapse: collapse; }
  .format-table th {
    background: none; color: var(--muted); font-family: var(--display); font-weight: 400;
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.14em;
    text-align: left; padding: 0.3rem 0.4rem 0.3rem 0; border-bottom: 1px solid var(--border);
  }
  .format-table td {
    padding: 0.35rem 0.4rem 0.35rem 0; border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .format-table tr:last-child td { border-bottom: 0; }
  .format-table th.num, .format-table td.num { text-align: right; }
  .pos-chip {
    display: inline-block; font-family: var(--display); font-weight: 600;
    font-style: italic; font-size: 0.74rem; padding: 0.05rem 0.4rem;
    border: 1px solid var(--border); color: var(--text); letter-spacing: 0.02em;
    transform: skewX(-11deg);
  }

  @media (max-width: 640px) {
    .format-grid { grid-template-columns: 1fr; }
    table.tower th, table.tower td { white-space: nowrap; }
  }
</style>
