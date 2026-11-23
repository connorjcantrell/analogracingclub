<script>
  import { goto } from '$app/navigation';
  import PageTitle from '$lib/PageTitle.svelte';
  import InfoTip from '$lib/InfoTip.svelte';
  import { MIN_RACES, WINDOW_RACES, cleanLevel } from '$lib/stake-rules.js';
  import { driverName, fmtDate, realConfig, resultsLink } from '$lib/format.js';

  let { data } = $props();
  const d = $derived(data.stake);
  const seasons = $derived(data.seasons ?? []);
  const drivers = $derived(d?.drivers ?? []);
  // Every session on the axis, keyed by step id, for the modal to name each
  // row of a driver's record.
  const stepOf = $derived(new Map((d?.axis ?? []).map((st) => [st.id, st])));
  // One series in a season is the norm; with more, each round names its series.
  const manySeries = $derived((d?.series?.length ?? 0) > 1);
  const trackText = (st) => [st.track, realConfig(st.config)].filter(Boolean).join(' · ');
  // A round reads "R3", a single session "★"; the header spells either out.
  const tick = (st) => (st.round != null ? `R${st.round}` : '★');
  const stepTitle = (st) => (st.round != null
    ? `Round ${st.round}${manySeries && st.seriesName ? ` · ${st.seriesName}` : ''}${st.track ? ` · ${trackText(st)}` : ''}`
    : st.title || trackText(st) || 'Single session');
  function pickSeason(e) {
    goto(`?season=${encodeURIComponent(e.currentTarget.value)}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  // Incidents per corner to three places (a clean driver sits well under
  // 0.01, so two would read as zero). The multiplier itself is never shown;
  // the green rows are its only trace.
  const ipcText = (x) => (x.ipc == null ? '–' : x.ipc.toFixed(3));
  // A driver under MIN_RACES races on record holds no stake yet: in place of
  // a figure their row wears a Provisional chip, whose panel says how many
  // more races they need and what they would hold today.
  const racesText = (n) => `${n} ${n === 1 ? 'race' : 'races'}`;
  const moreText = (x) => `${racesText(MIN_RACES - x.entered)} more to be eligible for Stake`;
  // A green row explains itself on hover: where the driver ranks for clean
  // driving among those whose rate counts (ties share a rank), over however
  // many of their races the window holds.
  const cleanRank = $derived.by(() => {
    const rated = drivers.filter((x) => !x.fixed && x.ipc != null).sort((a, b) => a.ipc - b.ipc);
    const rank = new Map();
    rated.forEach((x, i) => rank.set(x.custId, i > 0 && rated[i - 1].ipc === x.ipc ? rank.get(rated[i - 1].custId) : i + 1));
    return rank;
  });
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const cleanText = (x) => `${ordinal(cleanRank.get(x.custId))} cleanest driver in the club over their last ${racesText(Math.min(x.history, WINDOW_RACES))}. Their points count for more.`;

  // ---- Driver modal: every session, their finish and what it paid ----
  let openDriver = $state(null);
  const modal = $derived(openDriver == null ? null : drivers.find((x) => x.custId === openDriver) ?? null);
  const closeModal = () => (openDriver = null);
  // The page behind the modal must not scroll while it is up.
  $effect(() => {
    if (!modal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  });
  const finishText = (p) => (p.finish == null ? (p.earned ? '–' : 'Did not race') : `P${p.finish}`);
  const earnedText = (p) => (p.earned ? `+${p.earned}` : '0');
  const pctText = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);
  const moveText = (v) => (v == null || v === 0 ? '' : `${v > 0 ? '▲' : '▼'}${Math.abs(v).toFixed(1)}`);
  // Places gained or lost since the session before; nothing on a debut or a hold.
  const posMoveText = (v) => (v == null || v === 0 ? '' : `${v > 0 ? '▲' : '▼'}${Math.abs(v)}`);

  // Wide screens show every column. A phone shows position, driver and
  // stake; tapping a row floats the driver's races, points and incidents
  // per corner beneath it for a moment, then the card fades on its own.
  // Tapping the row again (or scrolling) dismisses it sooner, and tapping
  // another row moves it there.
  const PHONE = '(max-width: 640px)';
  const PEEK_MS = 2600;
  let peek = $state(null); // { custId, top, left, width }
  let peekTimer = null;
  const closePeek = () => { clearTimeout(peekTimer); peek = null; };
  function peekAt(x, row) {
    if (!window.matchMedia(PHONE).matches) return;
    if (peek?.custId === x.custId) return closePeek();
    const r = row.getBoundingClientRect();
    const margin = 12, width = Math.min(300, window.innerWidth - 2 * margin);
    peek = { custId: x.custId, top: r.bottom, left: Math.min(Math.max(margin, r.left + r.width / 2 - width / 2), window.innerWidth - margin - width), width };
    clearTimeout(peekTimer);
    peekTimer = setTimeout(closePeek, PEEK_MS);
  }
  const peeked = $derived(peek ? drivers.find((x) => x.custId === peek.custId) ?? null : null);
  const EMPTY = $derived(!seasons.length
    ? 'No season has been set up yet.'
    : 'No results yet. Stake appears after the first race of the season.');
</script>

<svelte:document onkeydown={(e) => { if (e.key === 'Escape' && modal) closeModal(); }} />
<svelte:window onscrollcapture={() => peek && closePeek()} onresize={() => peek && closePeek()} />

<svelte:head><title>Stake · Analog Racing Club</title></svelte:head>

<div class="tv">
  <div class="tv-head">
    <PageTitle inline>Stake<InfoTip label="What Stake is">
      <p>Stake is how the club is steered. After every season, the club votes on the next championship’s car and tracks, and your Stake is how much say you have. You earn it through performance and clean driving.</p>
    </InfoTip></PageTitle>
    {#if seasons.length > 1}
      <div class="tv-pick">
        <select class="series-pick" value={d?.season?.slug ?? ''} onchange={pickSeason} aria-label="Season">
          {#each seasons as s (s.slug)}<option value={s.slug}>{s.name}</option>{/each}
        </select>
      </div>
    {/if}
  </div>

  {#if drivers.length}
    <!-- Standings after the latest session: stake, and the move since the
         session before. Selecting a driver opens their session-by-session record. -->
    <div class="board-head">
      <span class="board-focus">{d.season.name}</span>
    </div>
    <div class="tv-board">
      <table class="tower">
        <thead>
          <tr>
            <th class="pos">Pos</th>
            <th class="drv">Driver</th>
            <th class="num wide">Races</th>
            <th class="num wide">Points</th>
            <th class="num wide" title="Incidents per corner over the last {WINDOW_RACES} races">Incidents/corner</th>
            <th class="num">Stake</th>
          </tr>
        </thead>
        <tbody>
          {#each drivers as x, i (x.custId)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <!-- A driver cleaner than the median sits on green, deeper the cleaner. -->
            <tr class={['sheet-row', { peeked: peek?.custId === x.custId, clean: x.multiplier > 1 }]} style:--clean={cleanLevel(x.multiplier)} title={x.multiplier > 1 ? cleanText(x) : undefined} onclick={(e) => peekAt(x, e.currentTarget)}>
              <td class="pos"><span class="pos-box">{i + 1}</span><span class={['chg', 'pos-chg', { 'chg-up': x.posChange > 0, 'chg-down': x.posChange < 0 }]}>{posMoveText(x.posChange)}</span></td>
              <td class="drv"><button type="button" class="drv-btn" title="Every session: finish and points" aria-haspopup="dialog" onclick={(e) => { e.stopPropagation(); openDriver = x.custId; }}>{driverName(x.displayName)}</button></td>
              <td class="num wide">{x.races}</td>
              <td class="num wide">{x.points}</td>
              <td class="num wide ipc">{ipcText(x)}</td>
              <td class="num total">{#if x.eligible}<span class="fig">{pctText(x.stake)}</span><span class={['chg', { 'chg-up': x.change > 0, 'chg-down': x.change < 0 }]}>{moveText(x.change)}</span>{:else}<span class="prov-slot"><InfoTip label="Provisional: {moreText(x)}">{#snippet button()}<span class="tv-chip">Provisional</span>{/snippet}<p>{moreText(x)}.</p><p>Projected Stake: <strong>{pctText(x.wouldBe)}</strong></p></InfoTip></span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <!-- The phone's peek: the hidden columns for the tapped row, floated
         beneath it (fixed to the viewport, so the table cannot clip it). -->
    {#if peeked}
      <div class="peek" role="status" style:top="{peek.top}px" style:left="{peek.left}px" style:width="{peek.width}px">
        <dl>
          <div><dt>Races</dt><dd>{peeked.races}</dd></div>
          <div><dt>Points</dt><dd>{peeked.points}</dd></div>
          <div><dt>Inc/corner</dt><dd title="Over the last {WINDOW_RACES} races">{ipcText(peeked)}</dd></div>
        </dl>
        {#if peeked.multiplier > 1}<p class="peek-note">{cleanText(peeked)}</p>{/if}
        {#if !peeked.eligible}<p class="peek-note">Provisional: {moreText(peeked)}. Projected Stake: {pctText(peeked.wouldBe)}</p>{/if}
      </div>
    {/if}
  {:else}
    <p class="empty">{EMPTY}</p>
  {/if}

  <!-- A driver's record: every session since their debut, where they finished
       its race, what it paid, and their stake after it. Each row links to the
       event's results. Click the backdrop or press Escape to dismiss. -->
  {#if modal}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="modal-back" onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div>
            <h3 id="modal-title" class="modal-name">{driverName(modal.displayName)}</h3>
            <p class="modal-sub">{#if modal.eligible}{pctText(modal.stake)} stake{:else}Provisional: {moreText(modal)}{/if}{#if modal.ipc != null}{' · '}{ipcText(modal)} incidents per corner{/if}{' · '}{racesText(modal.races)}{#if d?.season}{' · '}{d.season.name}{/if}</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close" onclick={closeModal}>×</button>
        </div>
        <div class="modal-body">
          <table class="tower record">
            <thead>
              <tr><th>Event</th><th class="num">Finish</th><th class="num">Points</th><th class="num">Stake</th><th></th></tr>
            </thead>
            <tbody>
              {#each [...modal.path].reverse() as p (p.id)}
                {@const st = stepOf.get(p.id)}
                <tr class={{ out: p.finish == null && !p.earned }}>
                  <td class="ev">
                    <span class="ev-tick">{st ? tick(st) : ''}</span>
                    <span class="ev-name">{st ? (st.round != null ? (trackText(st) || `Round ${st.round}`) : stepTitle(st)) : p.id}</span>
                    <span class="ev-date">{st?.date ? fmtDate(st.date) : ''}{#if st && manySeries && st.seriesName} · {st.seriesName}{/if}</span>
                  </td>
                  <td class="num">{finishText(p)}</td>
                  <td class="num">{earnedText(p)}</td>
                  <td class="num total">{pctText(p.stake)}</td>
                  <td class="num">{#if st}<a class="link" href={resultsLink(st.id)}>Results →</a>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}

  <p class="format-note"><a class="link" href="/vote">The next-season vote →</a></p>
</div>

<style>
  /* Same sheet language as the standings page: site tokens, hairline rules,
     tabular figures. */
  .tv-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }

  /* ---- Standings ---- */
  .board-head { margin: 2rem 0 0.8rem; }
  .board-focus { font-family: var(--display); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; font-size: 1.2rem; line-height: 1; }
  .tv-board { overflow-x: auto; border-top: 1px solid var(--accent); }
  table.tower { width: 100%; border-collapse: collapse; }
  table.tower th.num, table.tower td.num { text-align: right; }
  table.tower tbody tr:last-child td { border-bottom: 0; }
  table.tower td.drv { font-family: var(--display); font-weight: 500; letter-spacing: 0.02em; font-size: 1.1rem; }
  table.tower th, table.tower td { white-space: nowrap; }
  /* The stake figure in plain text colour, not the amber the site gives other
     totals. The figures share a box wide enough for 100.0%, so they all start
     at one left edge, and the Provisional chip starts at that same edge. */
  table.tower td.total { --fig: 3.7rem; font-family: var(--display); font-weight: 600; font-size: 1.1rem; font-variant-numeric: tabular-nums; color: var(--text); }
  table.tower td.total .fig { display: inline-block; min-width: var(--fig); text-align: right; }
  table.tower td.total .prov-slot { display: inline-block; min-width: calc(var(--fig) + 2.9rem); text-align: left; }
  .drv-btn { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; border-bottom: 1px solid transparent; }
  .drv-btn:hover { border-bottom-color: var(--accent); }
  table.tower td.ipc { font-family: var(--display); font-weight: 500; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  .peek-note { margin: 0.6rem 0 0; padding-top: 0.5rem; border-top: 1px dashed var(--border); color: var(--muted); font-size: 0.8rem; line-height: 1.4; white-space: normal; }
  /* The moves sit beside their figures, in a fixed slot so the figures line up. */
  table.tower .chg { display: inline-block; width: 2.6rem; text-align: left; margin-left: 0.3rem; }
  table.tower td.pos { width: auto; }
  table.tower .pos-chg { width: 1.8rem; margin-left: 0.15rem; }
  /* A driver cleaner than the median: the palette's green over the row, from
     nothing at 1.0x to the cap at the top multiplier. The cap keeps the
     text readable on either ground, and the hover lift layers on top. */
  tr.clean td { --clean-max: 28%; background: color-mix(in srgb, var(--green) calc(var(--clean) * var(--clean-max)), transparent); }
  tr.clean:hover td { background-image: linear-gradient(var(--hover), var(--hover)); }

  /* ---- The peek: the phone's card of hidden columns, beneath the tapped row ----
     Above the sticky header, below the driver modal. It fades in, holds
     for a moment (see PEEK_MS), and the component takes it down. */
  .peek {
    position: fixed; z-index: 40; margin-top: 0.35rem; padding: 0.7rem 0.9rem; box-sizing: border-box;
    background: var(--panel); border: 1px solid var(--border); border-top: 2px solid var(--accent); border-radius: var(--radius); box-shadow: var(--shadow);
    animation: peek-in 0.15s ease-out;
  }
  @keyframes peek-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .peek dl { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem 0.8rem; }
  .peek dl div { display: grid; gap: 0.15rem; }
  .peek dt { font-family: var(--display); color: var(--muted); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
  .peek dd { margin: 0; font-family: var(--display); font-weight: 500; font-size: 1.05rem; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* ---- Phone: three columns, the move under the stake, the rest in the peek ---- */
  @media (max-width: 640px) {
    /* The site's phone rule makes tables scrollable blocks; three narrow
       columns fit, so this one stays a real table at full width. */
    table.tower { display: table; width: 100%; }
    table.tower .wide { display: none; }
    tr.sheet-row { cursor: pointer; }
    /* Beside its figure there is no room for a name, so the move sits under the stake. */
    table.tower td.total .chg { display: block; width: auto; margin: 0; text-align: right; line-height: 1; font-size: 0.66rem; }
    table.tower td.total .chg:empty { display: none; }
    /* No move slot here, and the chip is wider than a figure, so it keeps to the right edge. */
    table.tower td.total .fig { min-width: 0; }
    table.tower td.total .prov-slot { min-width: 0; }
    /* The same under the position, in its narrow column. */
    table.tower .pos-chg { display: block; width: auto; margin: 0; line-height: 1; font-size: 0.66rem; }
    table.tower .pos-chg:empty { display: none; }
    table.tower th, table.tower td { padding-left: 0.4rem; padding-right: 0.4rem; }
    table.tower .pos { width: 2rem; }
    table.tower td.drv { width: 100%; white-space: normal; }
    /* A tap leaves a touch screen's row in :hover, so the site's hover lift
       is cancelled here; a clean row keeps its green regardless, and the
       tapped row holds the lift while its peek is up. */
    tr.sheet-row:hover td { background: none; }
    tr.sheet-row.clean:hover td, tr.sheet-row.clean.peeked td { background-color: color-mix(in srgb, var(--green) calc(var(--clean) * var(--clean-max)), transparent); }
    tr.sheet-row.peeked td { background-image: linear-gradient(var(--hover), var(--hover)); }
  }

  /* ---- Driver modal ---- */
  .modal-back {
    position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
    padding: 1rem; background: color-mix(in srgb, var(--bg) 78%, transparent); backdrop-filter: blur(2px);
  }
  .modal {
    width: min(44rem, 100%); max-height: calc(100vh - 2rem); display: flex; flex-direction: column;
    background: var(--panel); border: 1px solid var(--border); border-top: 1px solid var(--accent); border-radius: var(--radius); box-shadow: var(--shadow-lg);
  }
  .modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 1.1rem 0.8rem; border-bottom: var(--rule); }
  .modal-name { margin: 0; font-family: var(--display); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 1.4rem; line-height: 1.1; }
  .modal-sub { margin: 0.3rem 0 0; color: var(--muted); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .modal-close { background: none; border: 0; color: var(--muted); font-size: 1.6rem; line-height: 1; cursor: pointer; padding: 0 0.2rem; }
  .modal-close:hover { color: var(--text); }
  .modal-body { overflow: auto; }
  table.record td, table.record th { white-space: normal; }
  table.record td.ev { display: grid; grid-template-columns: 2.4rem minmax(0, 1fr); column-gap: 0.5rem; align-items: baseline; }
  .ev-tick { font-family: var(--display); font-weight: 500; color: var(--muted); font-size: 0.9rem; }
  .ev-name { font-family: var(--display); font-weight: 500; letter-spacing: 0.02em; }
  .ev-date { grid-column: 2; color: var(--muted); font-size: 0.8rem; }
  table.record tr.out td { color: var(--muted); }
  table.record tr.out td.ev .ev-name { color: var(--muted); }

  .format-note { margin: 2rem 0 0; font-size: 0.98rem; }
</style>
