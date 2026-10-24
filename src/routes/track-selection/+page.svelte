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
  <PageTitle>Next Season's Tracks</PageTitle>
  {#if data.me}
    <div class="who">Signed in as <strong>{data.me.driverName}</strong>.
      <form method="post" action="?/logout" onsubmit={() => localStorage.removeItem(CODE_KEY)}><button class="link" type="submit">Log out</button></form>
    </div>
  {:else if selection}
    <form class="code-form" method="post" action="?/login" use:enhance={enhanceLogin} bind:this={loginForm}>
      <label for="code">Passcode</label>
      <div class="code-row">
        <input id="code" type="text" name="code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" required bind:value={codeInput}>
        <button class="btn" type="submit">Sign in</button>
      </div>
      {#if form?.login && form?.error}<p class="msg err">{form.error}</p>{/if}
    </form>
  {/if}

  {#if !selection}
    <p class="empty">No track selection is open right now.</p>
  {:else}
    <p class="intro">
      <strong>{selection.title}.</strong> Each of these {data.pickers.length} drivers picks one round for next season:
      a track and layout, the weather, and whether it runs as a Standard or a Long round. No two drivers can pick the same track.
      {#if selection.trackTypes.length < 6}Tracks on offer: {selection.trackTypes.join(', ').toLowerCase()}s.{/if}
    </p>
    {#if data.me && !editing}
      <p class="muted">You're signed in, but you're not one of the drivers picking this time.</p>
    {/if}

    {#if editing}
      <form class="pick" method="post" action="?/pick" use:enhance>
        <h3>Your round</h3>

        {#if types.length > 1}
          <div class="field">
            <label for="type">Track type</label>
            <select id="type" value={typeFilter} onchange={chooseType}>
              <option value="">All types</option>
              {#each types as t (t)}<option value={t}>{t}</option>{/each}
            </select>
          </div>
        {/if}

        <div class="field">
          <label for="track">Track</label>
          <select id="track" name="trackId" value={trackId} onchange={chooseTrack}>
            <option value="" disabled selected={!trackId}>Choose a track</option>
            {#each tracks as t (t.id)}
              <option value={t.id} disabled={!!takenBy[t.id]}>{t.name}{takenBy[t.id] ? ` (taken by ${takenBy[t.id]})` : ''}</option>
            {/each}
          </select>
        </div>

        <!-- The layout only appears once a track is chosen; a track with a
             single layout shows it as a fact instead of a choice. -->
        {#if track}
          <div class="field">
            <label for="layout">Layout</label>
            {#if track.configs.length === 1}
              <input type="hidden" name="configId" value={configId}>
              <p id="layout" class="fact">{track.configs[0].shortName} ({track.configs[0].type}, {fmtLen(track.configs[0].lengthMi)}, {track.configs[0].turns} turns)</p>
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
          {#each data.weather as w (w.id)}
            <label class="option"><input type="radio" name="weather" value={w.id} bind:group={weather}> <span>{w.label}</span></label>
          {/each}
        </fieldset>

        <fieldset class="field">
          <legend>Format</legend>
          {#each data.variations as v (v.id)}
            <label class="option"><input type="radio" name="variation" value={v.id} bind:group={variation}> <span><strong>{v.label}</strong><br>{v.blurb}</span></label>
          {/each}
        </fieldset>

        <div class="field">
          <label for="notes">Anything else</label>
          <textarea id="notes" name="notes" rows="3" maxlength={data.notesMax} placeholder="Time of day, clock speed, weather details, etc." bind:value={notes}></textarea>
          <p class="hint" class:over={noteLen > data.notesMax}>{noteLen} / {data.notesMax} characters</p>
        </div>

        <div class="field">
          <button class="btn primary" type="submit" disabled={!ready}>Save pick</button>
          {#if form?.error && !form?.login}<p class="msg err">{form.error}</p>{/if}
          {#if form?.saved}<p class="msg ok">Saved. Change it any time while the selection is open.</p>{/if}
        </div>
      </form>
    {/if}

    <p class="tally">{data.picked} of {data.pickers.length} picked{#if data.typeCounts.length > 1 && data.picked}: {data.typeCounts.filter((t) => t.count).map((t) => `${t.count} ${t.type.toLowerCase()}`).join(', ')}{/if}.</p>
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
                <td class="muted" colspan="7">Not yet picked</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .sel { max-width: 60rem; margin: 0 auto; line-height: 1.5; }
  .who { margin: 0 0 1.5rem; color: var(--muted); }
  .who form { display: inline; }
  .link { background: none; border: 0; padding: 0; margin-left: 0.5rem; font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .code-form { margin: 0 0 1.5rem; }
  .code-form label { display: block; margin-bottom: 0.4rem; font-weight: 600; }
  .code-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .code-form input {
    flex: 1 1 10rem; max-width: 14rem; box-sizing: border-box;
    font-family: ui-monospace, monospace; font-size: 1rem; letter-spacing: 0.1em; text-transform: uppercase;
    background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 0.7rem 0.8rem;
  }
  .code-form input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .code-row .btn { padding: 0.7rem 1.2rem; font-size: 1rem; }

  .intro { max-width: 46rem; margin: 0 0 1rem; }
  .muted { color: var(--muted); }
  .msg { margin: 0.6rem 0 0; }
  .msg.ok { color: var(--green); }
  .msg.err { color: var(--red); }
  .empty { color: var(--muted); margin-top: 2rem; }

  /* ---- The pick form: one column, label above control, nothing fancy ---- */
  .pick { max-width: 34rem; margin: 2rem 0 0; }
  .pick h3 { margin: 0 0 1rem; font-size: 1.15rem; font-weight: 600; }
  .field { margin: 0 0 1.4rem; padding: 0; border: 0; min-width: 0; }
  .field label, .field legend { display: block; margin: 0 0 0.4rem; padding: 0; font-weight: 600; }
  .field select, .field textarea {
    display: block; width: 100%; box-sizing: border-box;
    background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.7rem 0.8rem; font: inherit; font-size: 1rem; line-height: 1.4;
  }
  .field select:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .field textarea { resize: vertical; }
  .fact { margin: 0; padding: 0.7rem 0; }
  .hint { margin: 0.4rem 0 0; font-size: 0.9rem; color: var(--muted); }
  .hint.over { color: var(--red); }
  .option { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.5rem 0; font-weight: 400; line-height: 1.5; cursor: pointer; }
  .option input { margin: 0.35rem 0 0; width: 1.1rem; height: 1.1rem; flex: none; accent-color: var(--accent); }
  .option strong { font-weight: 600; }
  .pick .btn.primary { padding: 0.7rem 1.4rem; font-size: 1rem; }
  .pick .btn.primary:disabled { opacity: 0.45; cursor: default; }
  .pick .msg { margin: 0.8rem 0 0; }

  /* ---- Picks table: scrolls sideways on a phone ---- */
  .tally { margin: 2.5rem 0 0.6rem; color: var(--muted); }
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .board { width: 100%; border-collapse: collapse; }
  .board th, .board td { text-align: left; padding: 0.7rem 1rem 0.7rem 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  .board th { font-weight: 600; white-space: nowrap; }
  .board .num { text-align: right; font-variant-numeric: tabular-nums; }
  .board .driver { white-space: nowrap; }
  .board .muted { color: var(--muted); }
  .board .note { min-width: 14rem; color: var(--muted); }
  .board tr.mine td { background: var(--accent-dim); }
</style>
