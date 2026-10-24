<script>
  import { enhance } from '$app/forms';
  import PageTitle from '$lib/PageTitle.svelte';

  let { data, form } = $props();
  const selection = $derived(data.selection);
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
      {#if selection.trackTypes.length < 6}Tracks on offer: {selection.trackTypes.join(', ').toLowerCase()}s.{/if}
    </p>
    {#if !data.me}
      <p class="gate-hint">Enter your passcode above to make your pick.{#if form?.login && form?.error} <span class="msg err">{form.error}</span>{/if}</p>
    {:else if !editing}
      <p class="gate-hint">You're signed in, but you're not one of the drivers picking this time.</p>
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
          {#if form?.error && !form?.login}<p class="msg err">{form.error}</p>{/if}
          {#if form?.saved}<p class="msg ok">Saved — change it any time while the selection is open.</p>{/if}
        </div>
      </form>
    {/if}

    <div class="board-head">
      <h3 class="board-title">The board</h3>
      <span class="tally"><strong>{data.picked}</strong> of {data.pickers.length} picked{#if data.typeCounts.length > 1 && data.picked}: {data.typeCounts.filter((t) => t.count).map((t) => `${t.count} ${t.type.toLowerCase()}`).join(', ')}{/if}</span>
    </div>
    <div class="scroll-x">
      <table class="board">
        <thead><tr><th>Driver</th><th>Track</th><th>Layout</th><th>Type</th><th class="num">Length</th><th>Weather</th><th>Format</th><th>Note</th></tr></thead>
        <tbody>
          {#each data.pickers as d (d.custId)}
            <tr class:mine={d.custId === data.me?.custId}>
              <td class="driver">{d.displayName}</td>
              {#if d.pick}
                <td>{d.pick.track}</td>
                <td>{d.pick.shortName}</td>
                <td class="muted">{d.pick.type}</td>
                <td class="num muted">{fmtLen(d.pick.lengthMi)}</td>
                <td>{weatherLabel[d.pick.weather] ?? d.pick.weather}</td>
                <td>{variationLabel[d.pick.variation] ?? d.pick.variation}</td>
                <td class="note">{d.pick.notes || ''}</td>
              {:else}
                <td class="pending" colspan="7">Not yet picked</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  /* Same broadcast language as the vote page and standings: site tokens,
     amber micro-labels, slanted accents, dark panels. */
  .sel { max-width: 60rem; margin: 0 auto; }
  .sel-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .who { display: flex; align-items: center; gap: 0.6rem; }
  .who-name { font-family: var(--display); font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .code-form { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .code-form input {
    width: 9.5rem; text-align: center; letter-spacing: 0.15em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    background: #0c0c0c; color: var(--text); border: 1px solid var(--border); padding: 0.45rem 0.5rem;
  }
  .code-form input:focus { outline: none; border-color: var(--accent); }

  .intro { max-width: 46rem; margin: 1.1rem 0 0; color: var(--muted); font-size: 0.95rem; line-height: 1.6; }
  .intro strong { color: var(--text); }
  .gate-hint { color: var(--muted); font-size: 0.9rem; margin: 0.7rem 0 0; max-width: 46rem; }
  .msg { font-size: 0.9rem; margin: 0; }
  .msg.ok { color: var(--accent); }
  .msg.err { color: var(--red); }
  .empty { color: var(--muted); margin-top: 2rem; }

  /* ---- The pick form: a pit-wall panel with a dark header strip ---- */
  .round { max-width: 42rem; margin: 2rem 0 0; border: 1px solid var(--border); background: var(--panel-dim); padding: 0 1.4rem 1.4rem; }
  .round-title {
    margin: 0 -1.4rem 1.4rem; padding: 0.5rem 1.4rem;
    background: #0c0c0c; border-bottom: 1px solid var(--border);
    color: var(--accent); font-size: 0.72rem; font-weight: 500; letter-spacing: 0.18em;
  }
  .field { margin: 0 0 1.5rem; padding: 0; border: 0; min-width: 0; }
  .field label, .field legend {
    display: block; margin: 0 0 0.5rem; padding: 0;
    font-family: var(--display); font-weight: 500; font-size: 0.72rem;
    text-transform: uppercase; letter-spacing: 0.18em; color: var(--accent);
  }
  .grid2 { display: grid; grid-template-columns: minmax(9rem, 1fr) 2fr; gap: 1.2rem; }
  .grid2.single { grid-template-columns: 1fr; }
  .grid2 .field { margin-bottom: 1.5rem; }
  .field select, .field textarea {
    display: block; width: 100%;
    background: #0c0c0c; color: var(--text); border: 1px solid var(--border);
    padding: 0.6rem 0.7rem; font: inherit; font-size: 0.95rem; line-height: 1.4;
  }
  .field textarea { resize: vertical; }
  .field textarea:focus { outline: 2px solid var(--accent); outline-offset: 3px; }
  .fact { margin: 0; padding: 0.15rem 0 0; font-family: var(--display); font-size: 1.05rem; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
  .fact .spec { margin-left: 0.6rem; color: var(--muted); font-size: 0.82rem; letter-spacing: 0.1em; }

  /* Weather: a row of slanted chips; the picked one fills amber. */
  .chip-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .chip-opt { position: relative; }
  .chip-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .chip-face {
    display: inline-block; padding: 0.4rem 1rem; transform: skewX(-11deg);
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
    background: #0c0c0c; border: 1px solid var(--border);
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
  .count { font-family: var(--display); font-size: 0.72rem; letter-spacing: 0.12em; color: var(--muted); font-variant-numeric: tabular-nums; }
  .count.over { color: var(--red); }

  .save-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .save-btn {
    padding: 0.55rem 1.6rem; transform: skewX(-11deg); cursor: pointer;
    background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent);
    font-family: var(--display); font-weight: 600; font-size: 0.9rem;
    text-transform: uppercase; letter-spacing: 0.14em;
    transition: background 0.15s, border-color 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent-soft); }
  .save-btn:disabled { opacity: 0.4; cursor: default; }

  /* ---- The board: who has picked what, timing-screen table ---- */
  .board-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 2.75rem 0 0.9rem; border-top: 2px solid var(--accent); padding-top: 0.9rem; }
  .board-title { color: var(--accent); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.2em; }
  .tally { color: var(--muted); font-size: 0.88rem; }
  .tally strong { color: var(--text); font-variant-numeric: tabular-nums; }
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .board td { vertical-align: top; }
  .board .driver { font-family: var(--display); font-weight: 500; letter-spacing: 0.03em; white-space: nowrap; }
  .board .muted { color: var(--muted); }
  .board .pending { color: var(--muted); font-style: italic; }
  .board .note { min-width: 14rem; color: var(--muted); }
  .board tr.mine td { background: var(--accent-dim); }
  .board tr.mine .driver { color: var(--accent); }

  @media (max-width: 640px) {
    .round { padding: 0 1rem 1.1rem; }
    .round-title { margin: 0 -1rem 1.2rem; padding: 0.5rem 1rem; }
    .grid2, .fmt-row { grid-template-columns: 1fr; }
  }
</style>
