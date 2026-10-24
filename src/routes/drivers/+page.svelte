<script>
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import PageTitle from '$lib/PageTitle.svelte';
  import { driverName } from '$lib/format.js';

  let { data } = $props();
  const d = $derived(data.stake);
  const drivers = $derived(d?.drivers ?? []);
  // Rounds that have run (the data points) and the whole schedule (the axis).
  const rounds = $derived(d?.rounds ?? []);
  const schedule = $derived(d?.schedule ?? []);
  const trackOf = $derived(new Map(schedule.map((r) => [r.round, r.track])));

  // Colour follows the driver, assigned once by current stake and never
  // repainted on hover or selection. Eight hues is the ceiling a reader can
  // tell apart; everyone past that is the field, drawn in one muted ink and
  // picked out by selecting them.
  const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
  const FIELD = '#6e675d';
  const colorOf = $derived(new Map(drivers.map((x, i) => [x.custId, PALETTE[i] ?? null])));
  const color = (custId) => colorOf.get(custId) ?? FIELD;
  const LABELLED = 4; // direct labels at the right edge, the rest via the legend

  // ---- Focus: which round the legend reads, and which driver is lit ----
  let hoverRound = $state(null);
  let pinnedRound = $state(null);
  const focusIdx = $derived.by(() => {
    const i = hoverRound ?? pinnedRound;
    return i != null && i < rounds.length ? i : rounds.length - 1;
  });
  const focus = $derived(rounds[focusIdx] ?? null);
  let hoverDriver = $state(null);
  let pinnedDriver = $state(null);
  const active = $derived(hoverDriver ?? pinnedDriver);
  const pinDriver = (id) => (pinnedDriver = pinnedDriver === id ? null : id);
  // A driver's point at the focus round (null before their debut), and their
  // move since the round before it.
  const at = (x, round) => x.path.find((p) => p.round === round) ?? null;
  const moveAt = (x, round) => {
    const i = x.path.findIndex((p) => p.round === round);
    return i > 0 ? Math.round((x.path[i].stake - x.path[i - 1].stake) * 10) / 10 : null;
  };
  const pctText = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
  const moveText = (v) => (v == null || v === 0 ? '' : `${v > 0 ? '▲' : '▼'}${Math.abs(v).toFixed(1)}`);

  // ---- Geometry: drawn at the container's pixel width so text stays legible ----
  let width = $state(720);
  const narrow = $derived(width < 560);
  // Side by side, the chart runs the full height of the driver list (its
  // header included); stacked on a phone it takes a fixed height.
  const ROWS = 16; // legend rows shown before it scrolls
  let legendH = $state(576);
  let headH = $state(36);
  const H = $derived(narrow ? 280 : Math.max(280, legendH - headH));
  const ML = 44, MT = 14, MB = 30;
  const MR = $derived(narrow ? 18 : 120);
  const plotW = $derived(Math.max(80, width - ML - MR));
  const plotH = $derived(H - MT - MB);
  const xAt = (round) => {
    const i = schedule.findIndex((r) => r.round === round);
    const n = schedule.length;
    return n <= 1 ? ML + plotW / 2 : ML + (plotW * Math.max(0, i)) / (n - 1);
  };
  // The axis crops to the highest stake ever held plus about a point of air,
  // so the lines use the whole height rather than a fifth of it.
  const yMax = $derived.by(() => {
    const top = Math.max(0, ...drivers.flatMap((x) => x.path.map((p) => p.stake)));
    return Math.max(2, Math.ceil(top + 1));
  });
  const yAt = (stake) => MT + plotH - (plotH * stake) / yMax;
  // Whole-number ticks, the finest step that keeps them to nine or fewer.
  const yTicks = $derived.by(() => {
    const step = [1, 2, 5, 10, 20, 25].find((st) => yMax / st <= 9) ?? 25;
    const out = [];
    for (let v = 0; v <= yMax; v += step) out.push(v);
    return out;
  });
  const lineOf = (x) => x.path.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.round).toFixed(1)},${yAt(p.stake).toFixed(1)}`).join(' ');
  // The active driver draws last so it sits on top of the field.
  const drawOrder = $derived([...drivers].reverse().sort((a, b) => (a.custId === active) - (b.custId === active)));
  // Bands between rounds that have run: hovering one focuses it.
  const bands = $derived.by(() => rounds.map((r, i) => {
    const x = xAt(r.round);
    const left = i === 0 ? ML : (xAt(rounds[i - 1].round) + x) / 2;
    const right = i === rounds.length - 1 ? ML + plotW : (x + xAt(rounds[i + 1].round)) / 2;
    return { i, x, left, width: right - left };
  }));
  // Direct labels for the leaders, nudged apart where their lines converge and
  // tied back to the line end with a leader when they had to move.
  const endLabels = $derived.by(() => {
    if (narrow) return [];
    const MIN = 14;
    const items = drivers.slice(0, LABELLED)
      .map((x) => ({ custId: x.custId, name: driverName(x.displayName), stake: x.stake, lineY: yAt(x.stake), y: yAt(x.stake), x: xAt(x.path.at(-1).round) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i += 1) if (items[i].y - items[i - 1].y < MIN) items[i].y = items[i - 1].y + MIN;
    const over = items.length ? items.at(-1).y - (MT + plotH) : 0;
    if (over > 0) for (const it of items) it.y -= over;
    return items;
  });

  let showTable = $state(false);
  const EMPTY = 'No results yet — stake appears after the first round.';
</script>

<svelte:head><title>Drivers · Analog Racing Club</title></svelte:head>

<div class="tv">
  <div class="tv-head">
    <PageTitle inline>Drivers</PageTitle>
    <div class="tv-pick"><SeriesPicker containers={data.pick.containers} hasSpecial={data.pick.hasSpecial} value={data.pick.slug} /></div>
  </div>

  {#if d}
    <div class="tv-meta">
      <span class="tv-series">{d.series.name}</span>
      <span class="tv-chip">{d.series.typeLabel}</span>
    </div>
  {/if}

  <!-- What stake is and what it buys. -->
  <section class="intro">
    <h3 class="intro-title">Stake</h3>
    <p>Stake is a driver’s share of every championship point the season has paid out so far. If the field has scored 600 points between them, a driver on 60 of those holds a 10% stake.</p>
    <p>It is how the club is steered. When the season closes, each driver’s stake becomes their weight in the vote on what comes next: the cars we drive and the tracks we select for the following season. The more of the season you have won, the more of its direction is yours to call.</p>
  </section>

  {#if drivers.length}
    <div class="viz">
      <!-- Chart: stake after each round, one line per driver. -->
      <div class="chart" bind:clientWidth={width}>
        <div class="chart-head" bind:clientHeight={headH}>
          <span class="chart-focus">
            After Round {focus.round}{#if trackOf.get(focus.round)} · {trackOf.get(focus.round)}{/if}
          </span>
          <span class="chart-pool">{focus.pool} pts in the pool</span>
        </div>
        <svg viewBox="0 0 {width} {H}" width={width} height={H} role="img" aria-label="Each driver’s stake after every round of the season" onpointerleave={() => (hoverRound = null)}>
          <!-- Gridlines and the y axis in percent. -->
          {#each yTicks as v (v)}
            <line class="grid" x1={ML} x2={ML + plotW} y1={yAt(v)} y2={yAt(v)} />
            <text class="tick" x={ML - 8} y={yAt(v)} text-anchor="end" dominant-baseline="middle">{v}%</text>
          {/each}
          <!-- The x axis runs the whole schedule; rounds still to come sit empty. -->
          {#each schedule as r (r.round)}
            {@const run = rounds.some((q) => q.round === r.round)}
            <text class={['tick', { future: !run }]} x={xAt(r.round)} y={H - 10} text-anchor="middle">R{r.round}</text>
          {/each}
          <!-- Crosshair at the focus round. -->
          {#if focus}
            <line class="cross" x1={xAt(focus.round)} x2={xAt(focus.round)} y1={MT} y2={MT + plotH} />
          {/if}
          <!-- Hover bands (under the lines) focus a round; tap/click pins it. -->
          {#each bands as b (b.i)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <rect class="band" x={b.left} y={MT} width={b.width} height={plotH}
                  onpointerenter={() => (hoverRound = b.i)} onclick={() => (pinnedRound = pinnedRound === b.i ? null : b.i)} />
          {/each}
          <!-- Lines, dimmed around the lit driver; the field shares one ink.
               Keyboard users reach every driver through the legend buttons. -->
          {#each drawOrder as x (x.custId)}
            {@const lit = active === x.custId}
            {@const dim = active != null && !lit}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g class={['series', { lit, dim, field: !colorOf.get(x.custId) }]} style:--c={color(x.custId)}
               onpointerenter={() => (hoverDriver = x.custId)} onpointerleave={() => (hoverDriver = null)} onclick={() => pinDriver(x.custId)}>
              <path class="hit" d={lineOf(x)} />
              <path class="line" d={lineOf(x)} />
              {#if focus && at(x, focus.round)}
                <circle class="dot" cx={xAt(focus.round)} cy={yAt(at(x, focus.round).stake)} r={lit ? 5 : 3.5} />
              {/if}
              {#if x.path.length === 1}
                <circle class="dot" cx={xAt(x.path[0].round)} cy={yAt(x.path[0].stake)} r="4" />
              {/if}
            </g>
          {/each}
          <!-- Leaders named at the line end. -->
          {#each endLabels as l (l.custId)}
            {@const dim = active != null && active !== l.custId}
            <g class={['end-label', { dim }]}>
              {#if Math.abs(l.y - l.lineY) > 2}
                <line class="leader" x1={l.x + 6} y1={l.lineY} x2={l.x + 12} y2={l.y} />
              {/if}
              <text x={l.x + 14} y={l.y} dominant-baseline="middle">{l.name}</text>
            </g>
          {/each}
        </svg>
      </div>

      <!-- Legend doubles as the table for the focus round: stake, and the
           move since the round before. Select a driver to light their line. -->
      <ol class="legend" style:--rows={ROWS} bind:clientHeight={legendH}>
        {#each drivers as x, i (x.custId)}
          {@const p = focus ? at(x, focus.round) : null}
          {@const move = focus ? moveAt(x, focus.round) : null}
          <li>
            <button type="button" class={['legend-row', { lit: active === x.custId, dim: active != null && active !== x.custId, pinned: pinnedDriver === x.custId }]}
                    onpointerenter={() => (hoverDriver = x.custId)} onpointerleave={() => (hoverDriver = null)} onclick={() => pinDriver(x.custId)}>
              <span class="legend-pos">{i + 1}</span>
              <span class="swatch" style:--c={color(x.custId)}></span>
              <span class="legend-name">{driverName(x.displayName)}</span>
              <!-- Always present, so the value stays in its own column when there is no move. -->
              <span class={['chg', { 'chg-up': move > 0, 'chg-down': move < 0 }]}>{moveText(move)}</span>
              <span class="legend-val">{pctText(p?.stake)}</span>
            </button>
          </li>
        {/each}
      </ol>
    </div>

    <!-- The same numbers as a table, every round at once. -->
    <button class="toggle" type="button" onclick={() => (showTable = !showTable)}>{showTable ? 'Hide table' : 'Show as table'}</button>
    {#if showTable}
      <div class="tv-board">
        <table class="tower">
          <thead>
            <tr>
              <th class="pos">Pos</th>
              <th class="drv">Driver</th>
              {#each rounds as r (r.round)}<th class="num" title={trackOf.get(r.round) ?? ''}>R{r.round}</th>{/each}
              <th class="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {#each drivers as x, i (x.custId)}
              <tr>
                <td class="pos"><span class="pos-box">{i + 1}</span></td>
                <td class="drv">{driverName(x.displayName)}</td>
                {#each rounds as r (r.round)}<td class="num">{pctText(at(x, r.round)?.stake)}</td>{/each}
                <td class="num total">{x.points}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <p class="empty">{EMPTY}</p>
  {/if}

  <p class="format-note"><a class="link" href="/vote">The next-season vote →</a></p>
</div>

<style>
  /* Same broadcast language as the standings page: site tokens, slanted
     chips, tabular numerals. */
  .tv-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .tv-pick { transform: skewX(-11deg); }
  .tv-pick :global(.series-pick) { transform: skewX(11deg); border: 1px solid var(--border); background: var(--panel); padding: 0.4rem 0.7rem; }
  .tv-pick :global(.series-pick:hover) { border-color: var(--accent); }
  .tv-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin: 1.1rem 0 1.5rem; }
  .tv-series { font-family: var(--display); font-weight: 600; font-style: italic; text-transform: uppercase; letter-spacing: 0.08em; font-size: 1rem; }
  .tv-chip {
    font-family: var(--display); font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); border: 1px solid var(--accent); padding: 0.12rem 0.55rem; transform: skewX(-11deg);
  }

  /* ---- Intro ---- */
  .intro { max-width: 62ch; margin: 0 0 2rem; }
  .intro-title {
    margin: 0 0 0.7rem; color: var(--accent); font-family: var(--display); font-weight: 500;
    font-size: 0.78rem; letter-spacing: 0.2em; text-transform: uppercase;
  }
  .intro p { margin: 0 0 0.8rem; color: var(--text); font-size: 0.98rem; line-height: 1.55; }
  .intro p:last-child { margin-bottom: 0; }

  /* ---- Chart + legend ---- */
  .viz { display: grid; grid-template-columns: minmax(0, 1fr) 17rem; gap: 1.5rem 2rem; align-items: start; border-top: 2px solid var(--accent); padding-top: 1rem; }
  .chart { min-width: 0; }
  .chart-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 0 0 0.6rem; }
  .chart-focus { font-family: var(--display); font-weight: 600; font-style: italic; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.95rem; }
  .chart-pool { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  svg { display: block; max-width: 100%; overflow: visible; touch-action: pan-y; }

  .grid { stroke: var(--border); stroke-width: 1; shape-rendering: crispEdges; }
  .tick { fill: var(--muted); font-family: var(--display); font-size: 11px; letter-spacing: 0.06em; }
  .tick.future { fill: color-mix(in srgb, var(--muted) 45%, transparent); }
  .cross { stroke: var(--text); stroke-opacity: 0.35; stroke-width: 1; shape-rendering: crispEdges; pointer-events: none; }

  /* Lines are 2px, the lit one 3px; everyone else fades when a driver is lit.
     Dots ring themselves in the page colour so they stay legible on a crossing. */
  .series { cursor: pointer; transition: opacity 0.15s; }
  .series .line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; pointer-events: none; }
  .series .hit { fill: none; stroke: transparent; stroke-width: 14; }
  .series .dot { fill: var(--c); stroke: var(--bg); stroke-width: 2; pointer-events: none; }
  .series.lit .line { stroke-width: 3; }
  /* A lit field driver takes the text colour: the line stays a stroke (never
     a fill, which would close the path into a shape), the dot a filled ring. */
  .series.lit.field .line { stroke: var(--text); }
  .series.lit.field .dot { fill: var(--text); }
  .series.dim { opacity: 0.22; }

  .end-label text { fill: var(--text); font-family: var(--display); font-size: 12px; letter-spacing: 0.03em; }
  .end-label .leader { stroke: var(--muted); stroke-width: 1; }
  .end-label { transition: opacity 0.15s; }
  .end-label.dim { opacity: 0.3; }
  .band { fill: transparent; cursor: crosshair; }

  /* ---- Legend ---- */
  /* Rows are a fixed height so the list is exactly --rows tall before it
     scrolls, and the chart can match it. */
  .legend { --row: 2.25rem; list-style: none; margin: 0; padding: 0; max-height: calc(var(--rows) * var(--row)); overflow-y: auto; border-top: var(--rule); }
  .legend-row {
    display: grid; grid-template-columns: 1.6rem 0.8rem minmax(0, 1fr) auto 3.6rem; align-items: center; gap: 0.5rem;
    box-sizing: border-box; height: var(--row); width: 100%; padding: 0 0.3rem; background: none; border: 0; border-bottom: var(--rule);
    color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: opacity 0.15s, background 0.15s;
  }
  .legend-row:hover, .legend-row.lit { background: var(--accent-dim); }
  .legend-row.pinned { box-shadow: inset 2px 0 0 var(--accent); }
  .legend-row.dim { opacity: 0.45; }
  .legend-pos { font-family: var(--display); font-style: italic; font-weight: 700; color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .swatch { display: block; width: 0.8rem; height: 0.8rem; border-radius: 2px; background: var(--c); }
  .legend-name { font-family: var(--display); font-weight: 500; font-size: 0.98rem; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-val { text-align: right; font-family: var(--display); font-weight: 700; font-style: italic; font-variant-numeric: tabular-nums; }
  .legend .chg { margin: 0; }

  /* ---- Table view ---- */
  .toggle {
    margin: 1.4rem 0 0; background: none; border: 0; padding: 0; cursor: pointer;
    font-family: var(--display); color: var(--accent); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.14em;
    border-bottom: 1px solid transparent; transition: border-color 0.15s;
  }
  .toggle:hover { border-bottom-color: var(--accent); }
  .tv-board { overflow-x: auto; margin-top: 1rem; border-top: 2px solid var(--accent); }
  table.tower { width: 100%; border-collapse: collapse; }
  table.tower th.num, table.tower td.num { text-align: right; }
  table.tower td.drv { font-family: var(--display); font-weight: 500; letter-spacing: 0.02em; font-size: 1.02rem; }
  table.tower th, table.tower td { white-space: nowrap; }

  .format-note { margin: 2rem 0 0; font-size: 0.98rem; }

  @media (max-width: 760px) {
    .viz { grid-template-columns: 1fr; }
    .legend { max-height: none; }
  }
</style>
