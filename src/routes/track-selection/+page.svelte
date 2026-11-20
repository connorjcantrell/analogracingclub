<script>
  import { enhance } from '$app/forms';
  import { flip } from 'svelte/animate';
  import PageTitle from '$lib/PageTitle.svelte';
  import { LEAGUE_TZ } from '$lib/format.js';

  let { data, form } = $props();
  const selection = $derived(data.selection);
  const slots = $derived(data.community?.length ?? 0);
  const weatherLabel = $derived(Object.fromEntries((data.weather ?? []).map((w) => [w.id, w.label])));
  const variationLabel = $derived(Object.fromEntries((data.variations ?? []).map((v) => [v.id, v.label])));
  const fmtLen = (mi) => (mi == null ? '' : `${mi} mi`);

  // The passcode is remembered in localStorage, shared with the car vote: a
  // returning driver whose cookie lapsed is signed back in automatically. A
  // failed attempt forgets it so a dead code can't loop.
  const CODE_KEY = 'arc:vote-code';
  let loginForm = $state(null);
  let codeInput = $state('');
  let autoTried = false;
  $effect(() => {
    if (data.me || !selection || autoTried) return;
    const saved = localStorage.getItem(CODE_KEY);
    if (!saved || !loginForm) return;
    autoTried = true;
    codeInput = saved;
    queueMicrotask(() => loginForm?.requestSubmit());
  });
  function enhanceLogin({ formData }) {
    const entered = String(formData.get('code') ?? '');
    return async ({ result, update }) => {
      if (result.type === 'redirect') localStorage.setItem(CODE_KEY, entered);
      else localStorage.removeItem(CODE_KEY);
      await update();
    };
  }

  // The working pick, seeded from the saved one and re-seeded after each save.
  let trackId = $state('');
  let configId = $state('');
  let weather = $state('');
  let variation = $state('');
  let notes = $state('');
  $effect(() => {
    const p = data.me?.pick;
    trackId = p?.trackId ?? '';
    configId = p?.configId != null ? String(p.configId) : '';
    weather = p?.weather ?? '';
    variation = p?.variation ?? '';
    notes = p?.notes ?? '';
  });
  // Narrow the track list by type before choosing. Only applied when the
  // selection allows more than one type.
  let typeFilter = $state('');
  const types = $derived(selection?.trackTypes ?? []);
  const inFilter = (c) => !typeFilter || c.type === typeFilter;
  const tracks = $derived((data.tracks ?? [])
    .map((t) => ({ ...t, configs: t.configs.filter(inFilter) }))
    .filter((t) => t.configs.length));
  const track = $derived(tracks.find((t) => t.id === trackId) ?? null);
  // One track per selection: tracks other drivers hold are shown but disabled.
  const takenBy = $derived(Object.fromEntries((data.pickers ?? [])
    .filter((p) => p.pick && p.custId !== data.me?.custId)
    .map((p) => [p.pick.trackId, p.displayName])));
  function chooseType(e) {
    typeFilter = e.currentTarget.value;
    if (!track) { trackId = ''; configId = ''; }
    else if (!track.configs.some((c) => String(c.id) === configId)) configId = '';
  }
  // A single-layout track needs no layout choice; it is picked for you.
  function chooseTrack(e) {
    trackId = e.currentTarget.value;
    configId = track?.configs.length === 1 ? String(track.configs[0].id) : '';
  }
  const config = $derived(track?.configs.find((c) => String(c.id) === configId) ?? null);
  const noteLen = $derived([...notes].length);
  const ready = $derived(!!config && !!weather && !!variation && noteLen <= data.notesMax);
  const editing = $derived(!!data.me?.picker);
  // ---- The community vote: stake split across clicks ----
  const vote = $derived(data.vote);
  // Live tally: seeded by the server load, replaced by SSE pushes.
  let live = $state(null);
  const totals = $derived(live?.totals ?? vote?.totals ?? {});
  const backers = $derived(live?.backers ?? vote?.backers ?? {});
  const voters = $derived(live?.voters ?? vote?.voters ?? 0);

  // The clock drives the countdown and the open/closed flip, so the page
  // declares the winner the second the window ends without a refresh.
  let now = $state(Date.now());
  $effect(() => {
    if (!vote) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const voteStatus = $derived.by(() => {
    if (!vote) return 'none';
    if (now < Date.parse(vote.startsAt)) return 'upcoming';
    if (now >= Date.parse(vote.endsAt)) return 'closed';
    return 'open';
  });
  const fmtLeft = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s % 60}s` : `${m}m ${s % 60}s`;
  };
  // Vote times are shown on the league clock (Pacific), with the zone named.
  const fmtAt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: LEAGUE_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  // Live updates while the vote is open.
  $effect(() => {
    if (!vote || data.vote.status === 'closed') return;
    const es = new EventSource('/track-selection/stream');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      live = msg;
      if (msg.status === 'closed') es.close();
    };
    return () => es.close();
  });

  // The ballot: every eligible layout as "Track – Short name" (just the track
  // when they match), on tracks no remaining driver holds.
  const held = $derived(new Set((data.pickers ?? []).filter((p) => p.pick).map((p) => p.pick.trackId)));
  const combos = $derived((data.tracks ?? [])
    .filter((t) => !held.has(t.id))
    .flatMap((t) => t.configs.map((c) => ({ id: `${t.id}:${c.id}`, name: c.shortName && c.shortName !== t.name ? `${t.name} – ${c.shortName}` : t.name, type: c.type, lengthMi: c.lengthMi })))
    .sort((a, b) => a.name.localeCompare(b.name)));
  const comboById = $derived(new Map(combos.map((c) => [c.id, c])));
  const nameOf = (id) => comboById.get(id)?.name ?? id;
  // Narrow a long list by typing part of a name, or by switching off track
  // types. Every type is on by default; the ones switched off are remembered
  // in localStorage (so a type added later still starts on).
  let find = $state('');
  const TYPES_KEY = 'arc:track-vote-types-off';
  let typesOff = $state({});
  $effect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TYPES_KEY) ?? '[]');
      if (Array.isArray(saved)) typesOff = Object.fromEntries(saved.filter((t) => types.includes(t)).map((t) => [t, true]));
    } catch { /* no storage, every type stays on */ }
  });
  function toggleType(t) {
    if (typesOff[t]) delete typesOff[t]; else typesOff[t] = true;
    try { localStorage.setItem(TYPES_KEY, JSON.stringify(Object.keys(typesOff))); } catch { /* fine */ }
  }
  const typeOn = (c) => !typesOff[c.type];
  const matches = (c) => typeOn(c) && (!find || c.name.toLowerCase().includes(find.trim().toLowerCase()));

  // The voter's working ballot: clicks per layout, re-seeded from the saved
  // ballot after each save. Their stake splits evenly across the clicks.
  let counts = $state({});
  $effect(() => {
    if (data.me && vote) counts = Object.fromEntries(combos.map((c) => [c.id, data.me.counts?.[c.id] ?? 0]));
  });
  const clicks = $derived(Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0));
  const editingVote = $derived(voteStatus === 'open' && !!data.me);
  const myStake = $derived(data.me?.stake ?? 0);
  const savedClicks = $derived(Object.values(data.me?.counts ?? {}).reduce((a, b) => a + b, 0));
  // The server totals already fold in the voter's *saved* ballot, so peel that
  // off and add the *working* figure — the bar moves as they click, before Save.
  const savedShare = (id) => (savedClicks ? (myStake * (data.me?.counts?.[id] ?? 0)) / savedClicks : 0);
  const workingShare = (id) => (clicks ? (myStake * (Number(counts[id]) || 0)) / clicks : 0);
  const mineOf = (id) => (data.me ? (editingVote ? workingShare(id) : savedShare(id)) : 0);
  const othersOf = (id) => (totals[id] ?? 0) - savedShare(id);
  const totalOf = (id) => othersOf(id) + mineOf(id);
  // Every bar shares one axis from zero to the longest bar.
  const axisMax = $derived(Math.max(1, ...combos.map((c) => totalOf(c.id))));
  const x = (v) => (Math.max(0, v) / axisMax) * 100;
  const seg = (a, b) => `left:${x(Math.min(a, b))}%;width:${Math.abs(x(b) - x(a))}%`;
  // Ranking follows the working totals, so rows re-order as the voter clicks
  // (and as other ballots land); layouts with no stake follow alphabetically.
  // Watchers see only the staked ones; the ballot lists everything, narrowed
  // by the filter.
  const ranked = $derived([...combos].sort((a, b) => totalOf(b.id) - totalOf(a.id) || a.name.localeCompare(b.name)));
  const staked = $derived(ranked.filter((c) => (totals[c.id] ?? 0) > 0 && typeOn(c)));
  const stakedAll = $derived(ranked.filter((c) => (totals[c.id] ?? 0) > 0).length);
  const listed = $derived(ranked.filter(matches));
  const anyStake = $derived(combos.some((c) => totalOf(c.id) > 0));
  const topStake = $derived(Math.max(0, ...combos.map((c) => totalOf(c.id))));
  const leading = (id) => anyStake && totalOf(id) === topStake;
  const fmtStake = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
  // The voter's split: what share of their own stake sits on this round.
  const mySplit = (id) => (clicks ? Math.round((100 * (Number(counts[id]) || 0)) / clicks) : 0);
  const backersOf = (id) => {
    let n = backers[id] ?? 0;
    if (editingVote) n += (workingShare(id) > 0 ? 1 : 0) - (savedShare(id) > 0 ? 1 : 0);
    return n;
  };
  const tipOf = (id) => {
    const n = backersOf(id);
    return n ? `${n} driver${n === 1 ? '' : 's'} · ${fmtStake(totalOf(id))} of the pool` : 'No stake yet';
  };
  // The split strip at the top of the ballot: one slice per round with
  // stake on it, sized by its share of the voter's stake, biggest first.
  const slices = $derived.by(() => {
    if (!vote || !clicks) return [];
    return combos
      .map((c) => ({ id: c.id, name: c.name, n: Number(counts[c.id]) || 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => ({ ...x, pct: (100 * x.n) / clicks, label: `${Math.round((1000 * x.n) / clicks) / 10}%` }));
  });
  const inc = (id) => { counts[id] = (Number(counts[id]) || 0) + 1; };
  const dec = (id) => { counts[id] = Math.max(0, (Number(counts[id]) || 0) - 1); };
  const clearAll = () => { for (const k of Object.keys(counts)) counts[k] = 0; };
  const comboSub = (c) => [c.type, c.lengthMi ? fmtLen(c.lengthMi) : null].filter(Boolean).join(' · ');

  // The winners once closed: the top round per slot, ties kept — worked out
  // here too so the board fills in the second the window ends.
  const closedWinners = $derived.by(() => {
    if (voteStatus !== 'closed' || !vote) return null;
    if (vote.winners) return vote.winners;
    // Only staked layouts can win; the server's view has them resolved.
    const cands = vote.candidates.filter((c) => totals[c.id]);
    if (!cands.length) return [];
    const net = (c) => totals[c.id] ?? 0;
    const sorted = [...cands].sort((a, b) => net(b) - net(a));
    const cut = net(sorted[Math.min(Math.max(1, slots), sorted.length) - 1]);
    return sorted.filter((c) => net(c) >= cut);
  });
  const community = $derived((data.community ?? []).map((c, i) => ({ ...c, pick: c.pick ?? closedWinners?.[i] ?? null })));
  const pendingText = $derived.by(() => {
    if (!vote) return 'Decided by community vote';
    if (voteStatus === 'upcoming') return `Vote opens ${fmtAt(vote.startsAt)}`;
    if (voteStatus === 'open') return 'Voting now';
    return 'No stake was placed';
  });
  const voteMsg = $derived(form?.vote ? {
    error: form.error,
    ok: form.saved ? `Saved — ${form.clicks ? `your ${fmtStake(form.stake)} stake is split ${form.clicks === 1 ? 'onto one round' : `${form.clicks} ways`}` : 'nothing staked'}. Change it anytime before the vote closes.` : null,
  } : null);
</script>

<svelte:head>
  <title>Track Selection · Analog Racing Club</title>
  <!-- Hidden page: reachable only by the direct link. -->
  <meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="sel">
  <div class="sel-head">
    <PageTitle inline>Next Season's Tracks</PageTitle>
    {#if data.me}
      <div class="who">
        <span class="who-name">{data.me.driverName}</span>
        <form method="post" action="?/logout" onsubmit={() => localStorage.removeItem(CODE_KEY)}><button class="btn sm" type="submit">Log out</button></form>
      </div>
    {:else if selection}
      <form class="code-form" method="post" action="?/login" use:enhance={enhanceLogin} bind:this={loginForm}>
        <input type="text" name="code" placeholder="XXXX-XXXX" aria-label="Passcode" autocomplete="off" spellcheck="false" required bind:value={codeInput}>
        <button class="btn" type="submit">Sign in</button>
      </form>
    {/if}
  </div>

  {#if !selection}
    <p class="empty">No track selection is open right now.</p>
  {:else}
    <p class="intro">
      <strong>{selection.title}.</strong> Each of these {data.pickers.length} drivers picks one round for next season:
      a track and layout, the weather, and whether it runs as a Standard or a Long round. No two drivers can pick the same track.
      {#if slots}{slots === 1 ? 'One more round is' : `${slots} more rounds are`} chosen by the whole club in a community vote.{/if}
      {#if selection.trackTypes.length < 6}Tracks on offer: {selection.trackTypes.join(', ').toLowerCase()}s.{/if}
    </p>
    {#if !data.me}
      <p class="gate-hint">Enter your passcode above to make your pick.{#if form?.login && form?.error} <span class="msg err">{form.error}</span>{/if}</p>
    {:else if !editing}
      <p class="gate-hint">You're signed in, but you're not one of the drivers picking this time.{#if vote} You can still stake on the community pick below.{/if}</p>
    {/if}

    {#if editing}
      <form class="round" method="post" action="?/pick" use:enhance>
        <h3 class="round-title">Your round</h3>

        <div class="grid2" class:single={types.length <= 1}>
          {#if types.length > 1}
            <div class="field">
              <label for="type">Track type</label>
              <select id="type" bind:value={typeFilter} onchange={chooseType}>
                <option value="">All types</option>
                {#each types as t (t)}<option value={t}>{t}</option>{/each}
              </select>
            </div>
          {/if}

          <div class="field">
            <label for="track">Track</label>
            <select id="track" name="trackId" bind:value={trackId} onchange={chooseTrack}>
              <option value="" disabled>Choose a track</option>
              {#each tracks as t (t.id)}
                <option value={t.id} disabled={!!takenBy[t.id]}>{t.name}{takenBy[t.id] ? ` (taken by ${takenBy[t.id]})` : ''}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- The layout only appears once a track is chosen; a track with a
             single layout shows it as a fact instead of a choice. -->
        {#if track}
          <div class="field">
            <label for="layout">Layout</label>
            {#if track.configs.length === 1}
              <input type="hidden" name="configId" value={configId}>
              <p id="layout" class="fact">{track.configs[0].shortName} <span class="spec">{track.configs[0].type} · {fmtLen(track.configs[0].lengthMi)} · {track.configs[0].turns} turns</span></p>
            {:else}
              <select id="layout" name="configId" bind:value={configId}>
                <option value="" disabled>Choose a layout</option>
                {#each track.configs as c (c.id)}
                  <option value={String(c.id)}>{c.name ?? c.shortName} ({c.type}, {fmtLen(c.lengthMi)}, {c.turns} turns)</option>
                {/each}
              </select>
            {/if}
          </div>
        {/if}

        <fieldset class="field">
          <legend>Weather</legend>
          <div class="chip-row">
            {#each data.weather as w (w.id)}
              <label class="chip-opt">
                <input type="radio" name="weather" value={w.id} bind:group={weather}>
                <span class="chip-face">{w.label}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Format</legend>
          <div class="fmt-row">
            {#each data.variations as v (v.id)}
              <label class="fmt-opt">
                <input type="radio" name="variation" value={v.id} bind:group={variation}>
                <span class="fmt-face">
                  <strong>{v.label}</strong>
                  <small>{v.blurb}</small>
                </span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="field">
          <div class="note-head">
            <label for="notes">Anything else</label>
            <span class="count" class:over={noteLen > data.notesMax}>{noteLen} / {data.notesMax}</span>
          </div>
          <textarea id="notes" name="notes" rows="3" maxlength={data.notesMax} placeholder="Time of day, clock speed, weather details, etc." bind:value={notes}></textarea>
        </div>

        <div class="save-row">
          <button class="save-btn" type="submit" disabled={!ready}>Save pick</button>
          {#if form?.error && !form?.login && !form?.vote}<p class="msg err">{form.error}</p>{/if}
          {#if form?.saved}<p class="msg ok">Saved — change it any time while the selection is open.</p>{/if}
        </div>
      </form>
    {/if}

    {#if vote}
      <!-- The community vote: every driver with a passcode splits their stake
           (share of the season's points) across the shortlisted rounds. -->
      <section class="cv">
        <div class="cv-head">
          <h3 class="cv-title">Community pick{slots === 1 ? '' : 's'}</h3>
          <div class="cv-meta">
            {#if voteStatus === 'upcoming'}
              <span class="chip">Opens {fmtAt(vote.startsAt)}</span>
            {:else if voteStatus === 'open'}
              <span class="chip live">● Live</span>
              <span class="chip">Closes in {fmtLeft(Date.parse(vote.endsAt) - now)}</span>
            {:else}
              <span class="chip">Closed {fmtAt(vote.endsAt)}</span>
            {/if}
            <span class="chip dim">{voters} driver{voters === 1 ? '' : 's'} staked</span>
          </div>
        </div>
        <p class="cv-blurb">
          {slots === 1 ? 'One round' : `${slots} rounds`} for the whole club to choose: any layout on offer that no driver has already taken.
          Your stake is your share of the season's points. Put it all on one layout, or click several and it splits evenly between them:
          two layouts is 50/50, a second click on one of them makes it two thirds.
          {#if slots > 1}The top {slots} win.{:else}The layout with the most stake wins.{/if} Weather and format are set when the round goes on the schedule.
        </p>
        {#if data.me}
          <p class="gate-hint">Your <strong>{data.me.points}</strong> points are a <strong>{fmtStake(myStake)}</strong> stake.</p>
        {:else if voteStatus !== 'closed'}
          <p class="gate-hint">Enter your passcode above to stake.</p>
        {/if}

        {#if closedWinners}
          <div class="winner">
            {#if closedWinners.length === 0}
              <span class="winner-label">No stake was placed.</span>
            {:else if closedWinners.length === slots}
              <span class="winner-label">{slots === 1 ? 'Winner' : 'Winners'}</span>
              <span class="winner-name">{closedWinners.map((w) => w.name).join(' · ')}</span>
            {:else}
              <span class="winner-label">Tie</span>
              <span class="winner-name">{closedWinners.map((w) => w.name).join(' · ')}</span>
            {/if}
          </div>
        {/if}

        {#snippet typeChips()}
          {#if types.length > 1}
            <div class="type-row" role="group" aria-label="Track types shown">
              {#each types as t (t)}
                <button class="type-chip" type="button" aria-pressed={!typesOff[t]} onclick={() => toggleType(t)}>{t}</button>
              {/each}
            </div>
          {/if}
        {/snippet}

        {#if editingVote}
          <!-- Interactive tally: click a round to put stake on it. The bright
               yellow is yours; the dim yellow is everyone else's. -->
          <form class="ballot" method="post" action="?/vote" use:enhance>
            <div class="budget">
              <span class="budget-label">Your stake</span>
              <span class="budget-count"><strong>{fmtStake(myStake)}</strong></span>
              <span class="budget-split">{clicks === 0 ? 'not placed yet' : clicks === 1 ? 'all on one round' : `split ${clicks} ways`}</span>
              <div class="budget-actions">
                <button class="btn sm" type="button" disabled={clicks === 0} onclick={clearAll}>Clear all</button>
                <button class="btn" type="submit">Save</button>
              </div>
            </div>
            <!-- How the stake is split: a strip of slices, each a round's share
                 of this voter's stake, with the round named under it. -->
            <div class="split" aria-label="How your stake is split">
              {#if slices.length}
                {#each slices as sl (sl.id)}
                  <div class="slice" style="flex-basis:{sl.pct}%" title="{sl.label} of your stake on {sl.name}">
                    <span class="slice-fill"><span class="slice-pct">{sl.label}</span></span>
                    <span class="slice-name">{sl.name}</span>
                  </div>
                {/each}
              {:else}
                <div class="slice none">
                  <span class="slice-fill"><span class="slice-pct">Nothing placed</span></span>
                  <span class="slice-name">Click + on a round to put your stake on it</span>
                </div>
              {/if}
            </div>
            {#if voteMsg?.error}<p class="msg err ballot-msg">{voteMsg.error}</p>{/if}
            {#if voteMsg?.ok}<p class="msg ok ballot-msg">{voteMsg.ok}</p>{/if}

            <div class="find-row">
              <input class="find" type="search" placeholder="Find a layout" aria-label="Find a layout" bind:value={find}>
              <span class="find-count">{listed.length} of {combos.length} layouts</span>
              {@render typeChips()}
            </div>
            <div class="bars">
              {#each listed as c (c.id)}
                {@const mine = mineOf(c.id)}
                {@const others = othersOf(c.id)}
                <div class="vrow" class:idle={totalOf(c.id) <= 0} animate:flip={{ duration: 400 }}>
                  <span class="cand"><span class="cand-name">{c.name}</span><small class="cand-sub">{comboSub(c)}</small></span>
                  <div class="lane" role="img" aria-label={tipOf(c.id)}>
                    {#if others > 0}<div class="seg others" style={seg(0, others)}></div>{/if}
                    {#if mine > 0}<div class="seg mine" style={seg(others, others + mine)}></div>{/if}
                    <span class="tip" role="tooltip">{tipOf(c.id)}</span>
                  </div>
                  <div class="ctl">
                    <button class="step" type="button" aria-label="Take a click off {c.name}" title="Take one off" disabled={!(Number(counts[c.id]) || 0)} onclick={() => dec(c.id)}>−</button>
                    <span class="mine-badge" title="Your share of your stake on {c.name}">{mySplit(c.id) ? `${mySplit(c.id)}%` : '—'}</span>
                    <button class="step" type="button" aria-label="Stake on {c.name}" title="Stake on it" onclick={() => inc(c.id)}>+</button>
                  </div>
                  <span class="total">{fmtStake(totalOf(c.id))}</span>
                </div>
              {/each}
            </div>
            <!-- The whole ballot travels, filter or not: one input per staked layout. -->
            {#each combos as c (c.id)}
              {#if counts[c.id]}<input type="hidden" name="cand:{c.id}" value={counts[c.id]}>{/if}
            {/each}
          </form>
        {:else}
          <!-- Watch-only tally: stake per round on the shared axis; the leader(s) brightened. -->
          {#if stakedAll}<div class="find-row">{@render typeChips()}</div>{/if}
          <div class="bars">
            {#each staked as c (c.id)}
              {@const pts = totalOf(c.id)}
              <div class="vrow watch" class:leader={leading(c.id)} animate:flip={{ duration: 500 }}>
                <span class="cand"><span class="cand-name">{c.name}</span><small class="cand-sub">{comboSub(c)}</small></span>
                <div class="lane" role="img" aria-label={tipOf(c.id)}>
                  <div class="bar" style={seg(0, pts)}></div>
                  <span class="tip" role="tooltip">{tipOf(c.id)}</span>
                </div>
                <span class="total">{fmtStake(pts)}</span>
              </div>
            {/each}
          </div>
          {#if !stakedAll}
            <p class="cv-note">Nothing staked yet. {combos.length} layouts are on offer.</p>
          {:else if !staked.length}
            <p class="cv-note">Every staked layout is of a type you switched off.</p>
          {:else if staked.length < combos.length}
            <p class="cv-note">{combos.length - staked.length} more layout{combos.length - staked.length === 1 ? ' has' : 's have'} no stake yet.</p>
          {/if}
          {#if voteStatus === 'upcoming'}
            <p class="cv-note">Staking opens {fmtAt(vote.startsAt)}.</p>
          {/if}
        {/if}
      </section>
    {/if}

    <div class="board-head">
      <h3 class="board-title">The board</h3>
      <span class="tally"><strong>{data.picked}</strong> of {data.pickers.length} picked{#if data.typeCounts.length > 1 && data.picked}: {data.typeCounts.filter((t) => t.count).map((t) => `${t.count} ${t.type.toLowerCase()}`).join(', ')}{/if}</span>
    </div>
    {#snippet pickBody(pick)}
      <span class="card-track">{pick.track}</span>
      <span class="card-layout">{pick.shortName}</span>
      <span class="card-spec">{pick.type}{pick.lengthMi ? ` · ${fmtLen(pick.lengthMi)}` : ''}{pick.turns ? ` · ${pick.turns} turns` : ''}</span>
      <!-- A community round has no weather or format yet; the admin sets them on the schedule. -->
      {#if pick.weather || pick.variation}
        <span class="card-tags">
          <span class="tag">{weatherLabel[pick.weather] ?? pick.weather}</span>
          <span class="tag">{variationLabel[pick.variation] ?? pick.variation}</span>
        </span>
      {/if}
      {#if pick.notes}<span class="card-note">{pick.notes}</span>{/if}
    {/snippet}
    <ul class="cards">
      {#each data.pickers as d (d.custId)}
        <li class="card" class:mine={d.custId === data.me?.custId}>
          <span class="card-driver">{d.displayName}</span>
          {#if d.pick}
            {@render pickBody(d.pick)}
          {:else}
            <span class="card-pending">Not yet picked</span>
          {/if}
        </li>
      {/each}
      <!-- One card per round left to the club, filled by the vote's winners. -->
      {#each community as c (c.slot)}
        <li class="card community">
          <span class="card-driver">Community pick{slots === 1 ? '' : ` ${c.slot}`}</span>
          {#if c.pick}
            {@render pickBody(c.pick)}
          {:else}
            <span class="card-pending">{pendingText}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* Same broadcast language as the vote page and standings: site tokens,
     grey micro-labels, hairline rules. */
  .sel { max-width: 60rem; margin: 0 auto; }
  .sel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .who { display: flex; align-items: center; gap: 0.6rem; }
  .who-name { font-family: var(--display); font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .code-form { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .code-form input {
    width: 9.5rem; text-align: center; letter-spacing: 0.15em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    background: var(--panel-dim); color: var(--text); border: 1px solid var(--border); padding: 0.45rem 0.5rem;
  }
  .code-form input:focus { outline: none; border-color: var(--accent); }

  .intro { max-width: 46rem; margin: 1.1rem 0 0; color: var(--muted); font-size: 0.95rem; line-height: 1.6; }
  .intro strong { color: var(--text); }
  .gate-hint { color: var(--muted); font-size: 0.9rem; margin: 0.7rem 0 0; max-width: 46rem; }
  .msg { font-size: 0.9rem; margin: 0; }
  .msg.ok { color: var(--green); }
  .msg.err { color: var(--red); }
  .empty { color: var(--muted); margin-top: 2rem; }

  /* ---- The pick form: a pit-wall panel with a dark header strip ---- */
  .round { max-width: 42rem; margin: 2rem 0 0; border: 1px solid var(--border); background: var(--panel-dim); padding: 0 1.4rem 1.4rem; }
  .round-title {
    margin: 0 -1.4rem 1.4rem; padding: 0.5rem 1.4rem;
    background: var(--panel-dim); border-bottom: 1px solid var(--border);
    color: var(--muted); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.14em;
  }
  .field { margin: 0 0 1.5rem; padding: 0; border: 0; min-width: 0; }
  .field label, .field legend {
    display: block; margin: 0 0 0.5rem; padding: 0;
    font-family: var(--display); font-weight: 500; font-size: 0.78rem;
    text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted);
  }
  .grid2 { display: grid; grid-template-columns: minmax(9rem, 1fr) 2fr; gap: 1.2rem; }
  .grid2.single { grid-template-columns: 1fr; }
  .grid2 .field { margin-bottom: 1.5rem; }
  .field select, .field textarea {
    display: block; width: 100%;
    background: var(--panel-dim); color: var(--text); border: 1px solid var(--border);
    padding: 0.6rem 0.7rem; font: inherit; font-size: 0.95rem; line-height: 1.4;
  }
  .field textarea { resize: vertical; }
  .field textarea:focus { outline: 2px solid var(--accent); outline-offset: 3px; }
  .fact { margin: 0; padding: 0.15rem 0 0; font-family: var(--display); font-size: 1.05rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
  .fact .spec { margin-left: 0.6rem; color: var(--muted); font-size: 0.82rem; letter-spacing: 0.1em; }

  /* Weather: a row of plain chips; the picked one fills amber. */
  .chip-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .chip-opt { position: relative; }
  .chip-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .chip-face {
    display: inline-block; padding: 0.4rem 1rem;
    border: 1px solid var(--border); color: var(--muted); cursor: pointer;
    font-family: var(--display); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .chip-opt:hover .chip-face { color: var(--text); border-color: var(--muted); }
  .chip-opt input:checked + .chip-face { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .chip-opt input:focus-visible + .chip-face { outline: 2px solid var(--accent); outline-offset: 3px; }

  /* Format: two cards side by side; the picked one gets the amber edge. */
  .fmt-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
  .fmt-opt { position: relative; display: block; cursor: pointer; }
  .fmt-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .fmt-face {
    display: block; height: 100%; padding: 0.8rem 1rem;
    background: var(--panel-dim); border: 1px solid var(--border);
    transition: border-color 0.15s, background 0.15s;
  }
  .fmt-face strong {
    display: block; margin-bottom: 0.3rem;
    font-family: var(--display); font-weight: 500; font-size: 0.95rem;
    text-transform: uppercase; letter-spacing: 0.1em; color: var(--text);
  }
  .fmt-face small { display: block; font-size: 0.85rem; line-height: 1.5; color: var(--muted); }
  .fmt-opt:hover .fmt-face { border-color: var(--muted); }
  .fmt-opt input:checked + .fmt-face { border-color: var(--accent); background: var(--accent-dim); }
  .fmt-opt input:checked + .fmt-face strong { color: var(--accent); }
  .fmt-opt input:focus-visible + .fmt-face { outline: 2px solid var(--accent); outline-offset: 3px; }

  .note-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .count { font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.12em; color: var(--muted); font-variant-numeric: tabular-nums; }
  .count.over { color: var(--red); }

  .save-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .save-btn {
    padding: 0.55rem 1.6rem; cursor: pointer;
    background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent);
    font-family: var(--display); font-weight: 600; font-size: 0.9rem;
    text-transform: uppercase; letter-spacing: 0.14em;
    transition: background 0.15s, border-color 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent-soft); }
  .save-btn:disabled { opacity: 0.4; cursor: default; }

  /* ---- The board: who has picked what, timing-screen table ---- */
  .board-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 2.75rem 0 0.9rem; border-top: 1px solid var(--accent); padding-top: 0.9rem; }
  .board-title { color: var(--muted); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.14em; }
  .tally { color: var(--muted); font-size: 0.88rem; }
  .tally strong { color: var(--text); font-variant-numeric: tabular-nums; }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
  .card {
    display: grid; gap: 0.2rem; align-content: start; padding: 0.9rem 1rem 1rem;
    background: var(--panel-dim); border: 1px solid var(--border); border-top: 2px solid var(--border);
  }
  .card.mine { border-top-color: var(--accent); }
  .card.community { border-style: dashed; border-top-style: solid; }
  .card-driver { font-family: var(--display); font-size: 0.78rem; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; }
  .card-track { font-family: var(--display); font-size: 1.05rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.25; }
  .card-layout { color: var(--text); font-size: 0.92rem; }
  .card-spec { color: var(--muted); font-size: 0.82rem; letter-spacing: 0.06em; }
  .card-tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; }
  .tag {
    font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--muted); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.15rem 0.55rem;
  }
  .card-note { margin-top: 0.6rem; color: var(--muted); font-size: 0.88rem; line-height: 1.45; }
  .card-pending { color: var(--muted); font-size: 0.92rem; }

  /* ---- The community vote: stake bars, in the car vote's language ---- */
  .cv { max-width: 60rem; margin: 2.75rem 0 0; border-top: 1px solid var(--accent); padding-top: 0.9rem; }
  .cv-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .cv-title { color: var(--muted); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.14em; }
  .cv-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .chip {
    font-family: var(--display); font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--muted); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.15rem 0.55rem;
  }
  .chip.dim { color: var(--muted); border-color: var(--border); }
  .chip.live { background: var(--accent); color: var(--on-accent); }
  .cv-blurb { max-width: 46rem; margin: 0.9rem 0 0; color: var(--muted); font-size: 0.92rem; line-height: 1.6; }
  .cv-note { color: var(--muted); font-size: 0.9rem; margin: 1rem 0 0; }
  .winner {
    display: flex; align-items: baseline; gap: 0.8rem; margin: 1.2rem 0 0; flex-wrap: wrap;
    border: 1px solid var(--border); border-left: 2px solid var(--accent); border-radius: var(--radius); padding: 0.8rem 1rem;
  }
  .winner-label { font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .winner-name { font-family: var(--display); font-weight: 600; font-size: 1.3rem; text-transform: uppercase; color: var(--text); }

  .bars { margin-top: 1.2rem; display: grid; gap: 0.55rem; }
  .vrow { align-items: center; }
  .cand { display: grid; gap: 0.05rem; min-width: 0; }
  .cand-name { font-family: var(--display); font-weight: 500; font-size: 0.98rem; letter-spacing: 0.02em; line-height: 1.25; }
  .cand-sub { color: var(--muted); font-size: 0.76rem; letter-spacing: 0.04em; }
  .vrow .total {
    text-align: right; font-family: var(--display); font-weight: 600;
    font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap;
  }
  .lane { position: relative; height: 1.1rem; background: rgba(255, 255, 255, 0.04); }
  .bar, .seg { position: absolute; top: 0; height: 100%; }
  .bar { background: var(--accent); opacity: 0.45; transition: width 0.6s ease, left 0.6s ease; }
  .tip {
    position: absolute; left: 0; bottom: calc(100% + 0.4rem); z-index: 2; display: none;
    white-space: nowrap; pointer-events: none;
    font-family: var(--display); font-size: 0.76rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text); background: var(--panel-dim); border: 1px solid var(--border); padding: 0.3rem 0.55rem;
  }
  .lane:hover .tip { display: block; }
  .vrow.watch { display: grid; grid-template-columns: minmax(9rem, 16rem) 1fr 4rem; gap: 0.75rem; }
  .vrow.watch.leader .bar { opacity: 1; }
  .vrow.watch.leader .total { color: var(--accent); }

  .ballot { margin: 1.2rem 0 0; border: 1px solid var(--border); background: var(--panel-dim); padding: 1.1rem 1.2rem; }
  .ballot .bars { margin-top: 0; }
  .budget {
    display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap;
    border: 1px solid var(--border); background: var(--panel-dim); padding: 0.6rem 1rem; margin-bottom: 1.2rem;
  }
  .budget-label { font-family: var(--display); font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .budget-count { font-family: var(--display); font-weight: 600; font-size: 1.5rem; font-variant-numeric: tabular-nums; line-height: 1; }
  .budget-count strong { color: var(--accent); }
  .budget-split { color: var(--muted); font-size: 0.85rem; }
  .budget-actions { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; }
  .ballot-msg { margin: -0.6rem 0 1.2rem; }
  /* The split strip: slices sit flush in one skewed bar, alternating fills so
     neighbours read apart, with the round's name under each. */
  .split { display: flex; gap: 2px; margin: 0 0 1.4rem; }
  .slice { flex: 1 1 0; min-width: 0; display: grid; gap: 0.3rem; transition: flex-basis 0.3s ease; }
  .slice-fill {
    display: flex; align-items: center; justify-content: center; height: 1.7rem; overflow: hidden;
    background: var(--accent);
  }
  .slice:nth-child(even) .slice-fill { background: var(--accent-soft); }
  .slice.none .slice-fill { background: rgba(255, 255, 255, 0.05); border: 1px dashed var(--border); }
  .slice-pct {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 0.4rem;
    font-family: var(--display); font-weight: 600; font-size: 0.9rem; font-variant-numeric: tabular-nums;
    color: var(--on-accent);
  }
  .slice.none .slice-pct { color: var(--muted); font-weight: 500; font-style: normal; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; }
  .slice-name {
    text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 0.2rem;
    font-family: var(--display); font-size: 0.76rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text);
  }
  .slice.none .slice-name { color: var(--muted); text-transform: none; letter-spacing: 0; font-family: var(--body); font-size: 0.82rem; }
  .find-row { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
  .find {
    width: 16rem; max-width: 100%; background: var(--panel-dim); color: var(--text); border: 1px solid var(--border);
    padding: 0.45rem 0.7rem; font: inherit; font-size: 0.92rem;
  }
  .find:focus { outline: none; border-color: var(--accent); }
  .find-count { color: var(--muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
  /* Track-type toggles: plain chips, filled while on, hollow and dim once switched off. */
  .type-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-left: auto; }
  .type-chip {
    padding: 0.3rem 0.8rem; cursor: pointer; border-radius: var(--radius);
    background: transparent; color: var(--text); border: 1px solid var(--rule-strong);
    font-family: var(--display); font-size: 0.78rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .type-chip[aria-pressed="false"] { background: transparent; color: var(--muted); border-color: var(--border); font-weight: 500; text-decoration: line-through; }
  .type-chip[aria-pressed="false"]:hover { color: var(--text); border-color: var(--muted); }
  .type-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .ballot .vrow.idle .cand-name { color: var(--muted); }
  .ballot .vrow.idle .total { color: var(--muted); font-weight: 500; }
  .ballot .vrow {
    display: grid; column-gap: 0.8rem; align-items: center;
    grid-template-columns: minmax(6rem, 13rem) 1fr auto 3.2rem;
    grid-template-areas: "cand lane ctl total";
    padding: 0.25rem 0; border-bottom: 1px solid var(--border);
  }
  .ballot .vrow .cand { grid-area: cand; }
  .ballot .vrow .lane { grid-area: lane; background: rgba(255, 255, 255, 0.05); }
  .ballot .vrow .ctl { grid-area: ctl; }
  .ballot .vrow .total { grid-area: total; }
  .seg { transition: width 0.3s ease, left 0.3s ease; }
  .seg.mine { background: var(--accent); }
  .seg.others { background: var(--accent); opacity: 0.4; }
  .ctl { display: flex; align-items: center; gap: 0.4rem; }
  .step {
    width: 1.9rem; height: 1.9rem; display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.15rem; line-height: 1; background: var(--panel-dim); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;
  }
  .step:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .step:disabled { opacity: 0.35; cursor: default; }
  .mine-badge {
    min-width: 2.6rem; text-align: center; font-family: var(--display); font-weight: 600;
    font-variant-numeric: tabular-nums; color: var(--accent); font-size: 1rem;
  }

  @media (max-width: 640px) {
    .vrow.watch { grid-template-columns: 1fr auto; }
    .vrow.watch .lane { grid-column: 1 / -1; order: 3; }
    .ballot .vrow {
      grid-template-columns: 1fr auto;
      grid-template-areas: "cand total" "lane lane" "ctl ctl";
      row-gap: 0.4rem;
    }
    .round { padding: 0 1rem 1.1rem; }
    .round-title { margin: 0 -1rem 1.2rem; padding: 0.5rem 1rem; }
    .grid2, .fmt-row { grid-template-columns: 1fr; }
  }
</style>
