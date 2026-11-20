<script>
  import { goto } from '$app/navigation';
  import PageTitle from '$lib/PageTitle.svelte';
  import { driverName, fmtDate, realConfig, SPECIAL_SLUG } from '$lib/format.js';

  let { data } = $props();
  const d = $derived(data.stake);
  const seasons = $derived(data.seasons ?? []);
  const drivers = $derived(d?.drivers ?? []);
  // Sessions that have run, keyed by step id (the axis also carries the
  // season's rounds still to come, which the modal never needs).
  const steps = $derived(d?.steps ?? []);
  const stepOf = $derived(new Map((d?.axis ?? []).map((st) => [st.id, st])));
  const latest = $derived(steps.at(-1) ?? null);
  // One series in a season is the norm; with more, each round names its series.
  const manySeries = $derived((d?.series?.length ?? 0) > 1);
  const trackText = (st) => [st.track, realConfig(st.config)].filter(Boolean).join(' · ');
  // A round reads "R3", a special event "★"; the header spells either out.
  const tick = (st) => (st.round != null ? `R${st.round}` : '★');
  const stepTitle = (st) => (st.round != null
    ? `Round ${st.round}${manySeries && st.seriesName ? ` · ${st.seriesName}` : ''}${st.track ? ` · ${trackText(st)}` : ''}`
    : st.title || trackText(st) || 'Special event');
  // Where the event's results live: ?round= for a league round, ?event= for a special.
  const resultsLink = (st) => (st.seriesSlug
    ? `/results?series=${encodeURIComponent(st.seriesSlug)}&round=${st.round ?? ''}`
    : `/results?series=${encodeURIComponent(SPECIAL_SLUG)}&event=${encodeURIComponent(st.id)}`);
  const windowText = (s) => `${fmtDate(s.startsAt)} – ${s.endsAt ? fmtDate(s.endsAt) : 'open'}`;
  function pickSeason(e) {
    goto(`?season=${encodeURIComponent(e.currentTarget.value)}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  // A driver's point at a session (null before their debut), and how many
  // sessions they have raced in: those with a finish, or that paid them.
  const at = (x, id) => x.path.find((p) => p.id === id) ?? null;
  const raced = (x) => x.path.filter((p) => p.finish != null || p.earned > 0).length;

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

  let showAll = $state(false);
  // On a phone the sheet shows position, driver, move and stake; tapping a
  // row opens the rest beneath it. Wide screens show every column.
  let open = $state(new Set());
  const toggle = (id) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); open = n; };
  const detail = (x) => [
    ['Races', raced(x)],
    ['Points', x.points],
    ...(showAll ? steps.map((st) => [tick(st), pctText(at(x, st.id)?.stake)]) : []),
  ];
  const EMPTY = $derived(!seasons.length
    ? 'No season has been set up yet.'
    : 'No results yet. Stake appears after the first race of the season.');
</script>

<svelte:document onkeydown={(e) => { if (e.key === 'Escape' && modal) closeModal(); }} />

<svelte:head><title>Stake · Analog Racing Club</title></svelte:head>

<div class="tv">
  <div class="tv-head">
    <PageTitle inline>Stake</PageTitle>
    {#if seasons.length > 1}
      <div class="tv-pick">
        <select class="series-pick" value={d?.season?.slug ?? ''} onchange={pickSeason} aria-label="Season">
          {#each seasons as s (s.slug)}<option value={s.slug}>{s.name}</option>{/each}
        </select>
      </div>
    {/if}
  </div>

  {#if d?.season}
    <div class="tv-meta">
      <span class="tv-series">{d.season.name}</span>
      <span class="tv-chip">{windowText(d.season)}</span>
      {#each d.series as s (s.slug)}<span class="tv-chip">{s.name}</span>{/each}
    </div>
  {/if}

  <!-- What stake is and what it buys. -->
  <section class="intro">
    <h3 class="intro-title">How it works</h3>
    <p>Stake is a driver’s share of every point paid out in the season so far, in its league rounds and in any special event raced during it. Nothing is dropped.</p>
    <p>It is how the club is steered. When the season closes, each driver’s stake becomes their weight in the vote on what comes next: the cars we drive and the tracks we select for the following season. The more of the season you have won, the more of its direction is yours to call.</p>
  </section>

  {#if drivers.length}
    <!-- Standings after the latest session: stake, and the move since the
         session before. Selecting a driver opens their session-by-session record. -->
    <div class="board-head">
      <span class="board-focus">After {stepTitle(latest)}</span>
      <span class="board-pool">{latest.pool} pts in the pool</span>
    </div>
    <div class="tv-board">
      <table class="tower">
        <thead>
          <tr>
            <th class="pos">Pos</th>
            <th class="drv">Driver</th>
            <th class="num more">Races</th>
            {#if showAll}
              {#each steps as st (st.id)}<th class="num more" title={stepTitle(st)}>{tick(st)}</th>{/each}
            {/if}
            <th class="num"></th>
            <th class="num">Stake</th>
          </tr>
        </thead>
        <tbody>
          {#each drivers as x, i (x.custId)}
            {@const isOpen = open.has(x.custId)}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <tr class={['sheet-row', { open: isOpen }]} onclick={() => toggle(x.custId)}>
              <td class="pos"><span class="pos-box">{i + 1}</span></td>
              <td class="drv"><button type="button" class="drv-btn" title="Every session: finish and points" aria-haspopup="dialog" onclick={(e) => { e.stopPropagation(); openDriver = x.custId; }}>{driverName(x.displayName)}</button></td>
              <td class="num more">{raced(x)}</td>
              {#if showAll}
                {#each steps as st (st.id)}<td class="num more">{pctText(at(x, st.id)?.stake)}</td>{/each}
              {/if}
              <td class="num"><span class={['chg', { 'chg-up': x.change > 0, 'chg-down': x.change < 0 }]}>{moveText(x.change)}</span></td>
              <td class="num total">{pctText(x.stake)}</td>
            </tr>
            {#if isOpen}
              <tr class="detail">
                <td colspan="4">
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
    <!-- The same standings with every session's stake alongside. -->
    <button class="toggle" type="button" onclick={() => (showAll = !showAll)}>{showAll ? 'Hide sessions' : 'Show every session'}</button>
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
            <p class="modal-sub">{modal.points} pts · {pctText(modal.stake)} stake{#if d?.season} · {d.season.name}{/if}</p>
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
                  <td class="num">{#if st}<a class="link" href={resultsLink(st)}>Results →</a>{/if}</td>
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
  .tv-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin: 1rem 0 1.6rem; }
  .tv-series { font-family: var(--display); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; font-size: 1.05rem; }
  .tv-chip {
    font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--muted); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.15rem 0.55rem;
  }

  /* ---- Intro ---- */
  .intro { max-width: 62ch; margin: 0 0 2rem; }
  .intro-title {
    margin: 0 0 0.7rem; color: var(--muted); font-family: var(--display); font-weight: 500;
    font-size: 0.8rem; letter-spacing: 0.14em; text-transform: uppercase;
  }
  .intro p { margin: 0 0 0.8rem; color: var(--text); font-size: 0.98rem; line-height: 1.55; }
  .intro p:last-child { margin-bottom: 0; }

  /* ---- Standings ---- */
  .board-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 0 0 0.6rem; }
  .board-focus { font-family: var(--display); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; font-size: 1.05rem; }
  .board-pool { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .tv-board { overflow-x: auto; border-top: 1px solid var(--accent); }
  table.tower { width: 100%; border-collapse: collapse; }
  table.tower th.num, table.tower td.num { text-align: right; }
  table.tower tbody tr:last-child td { border-bottom: 0; }
  table.tower td.drv { font-family: var(--display); font-weight: 500; letter-spacing: 0.02em; font-size: 1.1rem; }
  table.tower th, table.tower td { white-space: nowrap; }
  table.tower td.total { font-family: var(--display); font-weight: 600; font-size: 1.1rem; font-variant-numeric: tabular-nums; }
  .drv-btn { background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; border-bottom: 1px solid transparent; }
  .drv-btn:hover { border-bottom-color: var(--accent); }

  /* ---- Phone: four columns, tap a row for the rest ---- */
  tr.detail { display: none; }
  @media (max-width: 640px) {
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
  .toggle {
    margin: 1.4rem 0 0; background: none; border: 0; padding: 0; cursor: pointer;
    font-family: var(--display); color: var(--accent); font-size: 0.85rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;
    border-bottom: 1px solid transparent; transition: border-color 0.15s;
  }
  .toggle:hover { border-bottom-color: var(--accent); }

  /* ---- Driver modal ---- */
  .modal-back {
    position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
    padding: 1rem; background: color-mix(in srgb, var(--bg) 78%, transparent); backdrop-filter: blur(2px);
  }
  .modal {
    width: min(44rem, 100%); max-height: calc(100vh - 2rem); display: flex; flex-direction: column;
    background: var(--panel); border: 1px solid var(--border); border-top: 1px solid var(--accent); border-radius: var(--radius); box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
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
