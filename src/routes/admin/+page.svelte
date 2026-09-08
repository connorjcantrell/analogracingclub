<script>
  import { invalidateAll } from '$app/navigation';
  import PhotoPanel from '$lib/PhotoPanel.svelte';
  import PhotoPicker from '$lib/PhotoPicker.svelte';
  import PageTitle from '$lib/PageTitle.svelte';
  import { post } from '$lib/api.js';
  import { fmtDate, realConfig } from '$lib/format.js';

  let { data } = $props();
  const meta = $derived(data.meta);
  const series = $derived(data.series);
  const subs = $derived(data.subsessions);
  const posts = $derived(data.posts);
  const photos = $derived(data.photos);
  const refresh = () => invalidateAll();

  // Status line under each panel.
  class Msg {
    text = $state('');
    kind = $state('');
    set(text, kind = '') { this.text = text; this.kind = kind; }
  }
  const uploadMsg = new Msg(), newMsg = new Msg(), seriesMsg = new Msg(), schedMsg = new Msg(), pointsMsg = new Msg(), postMsg = new Msg();

  const eventTypeName = (id) => meta.eventTypes.find((t) => t.id === id)?.name ?? id;
  const formatName = (id) => meta.formats.find((f) => f.id === id)?.name ?? id;
  // A series is a container: only container-capable types can back one; special
  // (one-off) types are exactly the rest.
  const seriesTypes = $derived(meta.eventTypes.filter((t) => t.container));
  const specialTypes = $derived(meta.eventTypes.filter((t) => !t.container));
  // A league round can be filed into any series still open (upcoming or
  // active), not just active — a just-created series is upcoming.
  const openSeries = $derived(series.filter((s) => s.status !== 'complete'));

  // ---- Upload panel ---------------------------------------------------------
  let fileInput = $state(null);
  let isSpecial = $state(false);
  let leagueSeries = $state('');
  let leagueRound = $state(1);
  let specialType = $state('');
  let specialName = $state('');
  // Keep the series choice valid as the list changes, and default the round to
  // one past the highest already uploaded to that series.
  $effect(() => {
    if (!openSeries.some((s) => s.slug === leagueSeries)) leagueSeries = openSeries[0]?.slug ?? '';
    if (!specialTypes.some((t) => t.id === specialType)) specialType = specialTypes[0]?.id ?? '';
  });
  const nextRound = $derived.by(() => {
    const rounds = subs.filter((s) => s.seriesSlug === leagueSeries && s.round != null).map((s) => s.round);
    return (rounds.length ? Math.max(...rounds) : 0) + 1;
  });
  $effect(() => { leagueRound = nextRound; });

  // The result JSON carries the track; seed a special event's name from it.
  async function seedName() {
    const f = fileInput?.files?.[0];
    if (!f || specialName.trim()) return;
    try {
      const parsed = JSON.parse(await f.text());
      const t = (parsed?.data ?? parsed)?.track ?? {};
      specialName = [t.track_name, realConfig(t.config_name)].filter(Boolean).join(' — ');
    } catch { /* leave blank on unreadable files */ }
  }

  async function upload() {
    const f = fileInput?.files?.[0];
    if (!f) return uploadMsg.set('Choose a file first.', 'err');
    let q;
    if (isSpecial) {
      const name = specialName.trim();
      if (!specialTypes.length) return uploadMsg.set('No special event type is configured.', 'err');
      if (!name) return uploadMsg.set('Name the event first.', 'err');
      q = new URLSearchParams({ special: '1', eventType: specialType || specialTypes[0].id, title: name });
    } else {
      if (!leagueSeries) return uploadMsg.set('No series yet — create one first, or upload as a special event.', 'err');
      q = new URLSearchParams({ series: leagueSeries, round: String(leagueRound) });
    }
    uploadMsg.set('Uploading…');
    const res = await fetch(`/api/admin/upload?${q}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: await f.text(),
    }).then((r) => r.json());
    if (!res.ok) return uploadMsg.set(`Error: ${res.error}`, 'err');
    uploadMsg.set(`Saved ${res.subsessionId} to ${res.series ?? 'special events'}: ${res.drivers} drivers, ${res.results} results.`, 'ok');
    fileInput.value = ''; specialName = '';
    await refresh();
  }

  // ---- New series -----------------------------------------------------------
  let newEventType = $state('');
  let newSlug = $state('');
  let newName = $state('');
  let newRounds = $state(3);
  let newDrop = $state(0);
  let newFormat = $state('');
  $effect(() => {
    if (!seriesTypes.some((t) => t.id === newEventType)) newEventType = seriesTypes[0]?.id ?? meta.defaultEventType;
    if (!meta.formats.some((f) => f.id === newFormat)) newFormat = meta.default;
  });
  const newFormatDesc = $derived(meta.formats.find((f) => f.id === newFormat)?.description ?? '');
  // Picking an event type defaults the points format to what it expects.
  function pickNewType(e) {
    newEventType = e.currentTarget.value;
    const et = meta.eventTypes.find((t) => t.id === newEventType);
    if (et?.defaultFormat && meta.formats.some((f) => f.id === et.defaultFormat)) newFormat = et.defaultFormat;
  }
  async function createSeries() {
    const res = await post('/api/admin/series', {
      slug: newSlug.trim(), name: newName.trim(), eventType: newEventType,
      rounds: Number(newRounds) || 1, dropCount: Number(newDrop) || 0, format: newFormat,
    });
    newMsg.set(res.ok ? `Created ${res.slug}. Set its status to active when it starts.` : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    if (res.ok) { newSlug = ''; newName = ''; }
    await refresh();
    if (res.ok) selectSeries(res.slug);
  }

  // ---- Edit series ----------------------------------------------------------
  let editSlug = $state('');
  let editName = $state('');
  let editStatus = $state('upcoming');
  let editDrop = $state(0);
  let sched = $state([]);
  let editFormat = $state('');
  let pointsJson = $state('');
  const selected = () => series.find((x) => x.slug === editSlug);

  // Load the editor from the chosen series (on pick, and again after every
  // reload so saved values show).
  function fillEditor() {
    const s = selected();
    editName = s?.name ?? '';
    editStatus = s?.status ?? 'upcoming';
    editDrop = s?.dropCount ?? 0;
    sched = (s?.schedule ?? []).map((r) => ({ round: r.round, track: r.track ?? '', date: r.date ?? '', double: Number(r.multiplier) > 1 }));
    editFormat = s && meta.formats.some((f) => f.id === s.format) ? s.format : meta.default;
    pointsJson = s ? JSON.stringify(s.pointsConfig, null, 2) : '';
  }
  function selectSeries(slug) { editSlug = slug; fillEditor(); }
  $effect(() => {
    if (!series.some((s) => s.slug === editSlug)) editSlug = series[0]?.slug ?? '';
    fillEditor();
  });

  async function saveSeries() {
    const res = await post('/api/admin/series-update', { slug: editSlug, name: editName, status: editStatus, dropCount: Number(editDrop) || 0 });
    seriesMsg.set(res.ok ? 'Saved.' : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    await refresh();
  }
  async function deleteSeries() {
    const s = selected(); if (!s) return;
    const path = `/api/admin/series/${encodeURIComponent(s.slug)}`;
    // Dry run first: the server reports how many results would go with it.
    const dry = await post(path, null, 'DELETE');
    if (dry.ok || typeof dry.results !== 'number') return seriesMsg.set(`Error: ${dry.error ?? 'unexpected response'}`, 'err');
    const n = dry.results;
    const typed = prompt(
      `Delete series "${s.name}" and its ${n} stored result${n === 1 ? '' : 's'} (photos included)?\n`
      + `This cannot be undone. Type the slug to confirm:\n\n${s.slug}`);
    if (typed === null) return;
    if (typed.trim() !== s.slug) return seriesMsg.set('Not deleted — the slug did not match.', 'err');
    const res = await post(`${path}?confirm=${encodeURIComponent(s.slug)}`, null, 'DELETE');
    seriesMsg.set(res.ok
      ? `Deleted ${res.deleted}: ${res.results} result${res.results === 1 ? '' : 's'}, ${res.photos} photo${res.photos === 1 ? '' : 's'} removed.`
      : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    await refresh();
  }

  // Schedule rows keep their own round number, so a deleted round leaves the
  // rest untouched rather than renumbering and breaking uploaded results.
  function addRound() {
    const rounds = sched.map((r) => r.round);
    sched.push({ round: (rounds.length ? Math.max(...rounds) : 0) + 1, track: '', date: '', double: false });
  }
  async function saveSchedule() {
    const schedule = sched.map((r) => ({
      round: r.round, track: r.track.trim() || null, date: r.date.trim() || null, multiplier: r.double ? 2 : 1,
    })).sort((a, b) => a.round - b.round);
    const res = await post('/api/admin/series-update', { slug: editSlug, schedule });
    schedMsg.set(res.ok ? 'Schedule saved.' : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    await refresh();
  }
  async function applyPreset() {
    pointsMsg.set('Rescoring…');
    const res = await post('/api/admin/series-points', { slug: editSlug, format: editFormat });
    pointsMsg.set(res.ok ? `Applied ${res.format}; rescored ${res.rescored} sessions.` : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    await refresh();
  }
  async function saveCustom() {
    let pointsConfig;
    try { pointsConfig = JSON.parse(pointsJson); }
    catch (e) { return pointsMsg.set(`Invalid JSON: ${e.message}`, 'err'); }
    pointsMsg.set('Rescoring…');
    const res = await post('/api/admin/series-points', { slug: editSlug, pointsConfig });
    pointsMsg.set(res.ok ? `Saved custom format; rescored ${res.rescored} sessions.` : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    await refresh();
  }

  // ---- Stored results -------------------------------------------------------
  let openPanels = $state({});
  // Inline editor for a result's feed post: a headline that replaces the
  // automatic one, and a paragraph under it. Keyed by result id.
  let openPost = $state({});
  let postEdits = $state({});
  let resultPostMsg = $state({});
  function togglePostEditor(s) {
    openPost[s._id] = !openPost[s._id];
    if (openPost[s._id]) postEdits[s._id] = { postTitle: s.postTitle ?? '', postBody: s.postBody ?? '' };
  }
  async function saveResultPost(s) {
    const e = postEdits[s._id] ?? {};
    const res = await post(`/api/admin/subsessions/${encodeURIComponent(s._id)}`, { postTitle: e.postTitle ?? '', postBody: e.postBody ?? '' }, 'PATCH');
    resultPostMsg[s._id] = res.ok ? { text: 'Post saved.', kind: 'ok' } : { text: `Error: ${res.error}`, kind: 'err' };
    await refresh();
  }
  async function deleteResult(s) {
    if (!confirm(`Delete ${s._id}? This removes the stored result.`)) return;
    const res = await post(`/api/admin/subsessions/${encodeURIComponent(s._id)}`, null, 'DELETE');
    if (!res.ok) alert(`Error: ${res.error}`);
    await refresh();
  }
  const seriesName = (slug) => series.find((x) => x.slug === slug)?.name ?? slug;
  const trackOf = (s) => [s.track?.name, realConfig(s.track?.config)].filter(Boolean).join(' — ') || '—';
  const sessionsOf = (s) => (s.simsessions ?? []).map((x) => x.kind).filter((k) => k !== 'practice').join(', ');

  // ---- Schedule posts -------------------------------------------------------
  // A schedule post announces an upcoming season on the homepage feed: its own
  // rows (track, config, date) plus a carousel of photos picked from results.
  let postSeries = $state('');
  let postTitle = $state('');
  let postIntro = $state('');
  let postRounds = $state([]);
  let postPhotos = $state([]);
  const upcomingSeries = $derived(series.filter((s) => s.status !== 'complete'));
  $effect(() => {
    if (!series.some((s) => s.slug === postSeries)) postSeries = upcomingSeries[0]?.slug ?? series[0]?.slug ?? '';
  });

  // Prefill the title and rows from the chosen series' scoring schedule (config
  // is left blank — the series schedule doesn't carry one).
  function seedPostFromSeries() {
    const s = series.find((x) => x.slug === postSeries);
    if (!s) return;
    postTitle = s.name;
    postRounds = (s.schedule ?? []).map((r) => ({ round: r.round, track: r.track ?? '', config: '', date: r.date ?? '' }));
  }
  function addPostRound() {
    const rounds = postRounds.map((r) => r.round);
    postRounds.push({ round: (rounds.length ? Math.max(...rounds) : 0) + 1, track: '', config: '', date: '' });
  }
  // The same form edits an existing post: Edit loads it in, Save patches it.
  let editingPost = $state(null);
  const postRows = () => postRounds.map((r) => ({
    round: r.round, track: r.track.trim() || null, config: r.config.trim() || null, date: r.date.trim() || null,
  }));
  function editSchedulePost(p) {
    editingPost = p;
    postSeries = p.seriesSlug;
    postTitle = p.title ?? '';
    postIntro = p.intro ?? '';
    postRounds = (p.rounds ?? []).map((r) => ({ round: r.round, track: r.track ?? '', config: r.config ?? '', date: r.date ?? '' }));
    postPhotos = (p.photos ?? []).map((x) => x.url);
    postMsg.set(`Editing "${p.title}".`);
    document.getElementById('postForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cancelEditPost() {
    editingPost = null;
    postTitle = ''; postIntro = ''; postRounds = []; postPhotos = [];
    postMsg.set('');
  }
  async function createSchedulePost() {
    if (!postSeries) return postMsg.set('Pick a season first.', 'err');
    const res = await post('/api/admin/posts', {
      seriesSlug: postSeries, title: postTitle.trim(), intro: postIntro.trim(), rounds: postRows(), photos: postPhotos,
    });
    postMsg.set(res.ok ? 'Published to the feed.' : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    if (res.ok) { postIntro = ''; postPhotos = []; }
    await refresh();
  }
  async function saveSchedulePost() {
    if (!editingPost) return;
    const res = await post(`/api/admin/posts/${encodeURIComponent(editingPost._id)}`, {
      title: postTitle.trim(), intro: postIntro.trim(), rounds: postRows(), photos: postPhotos,
    }, 'PATCH');
    postMsg.set(res.ok ? 'Post updated.' : `Error: ${res.error}`, res.ok ? 'ok' : 'err');
    if (res.ok) editingPost = null;
    await refresh();
  }
  async function deleteSchedulePost(p) {
    if (!confirm(`Delete the schedule post "${p.title}"?`)) return;
    const res = await post(`/api/admin/posts/${encodeURIComponent(p._id)}`, null, 'DELETE');
    if (!res.ok) alert(`Error: ${res.error}`);
    await refresh();
  }
</script>

<svelte:head>
  <title>Admin · Analog Racing Club</title>
  <meta name="robots" content="noindex">
</svelte:head>

<div class="topbar">
  <PageTitle inline>Admin</PageTitle>
  <button class="btn sm" type="button" onclick={refresh}>↻ Refresh</button>
</div>

<section class="panel">
  <h3>Upload result</h3>
  <p class="desc">Choose an iRacing event-result JSON, then say where it belongs.</p>
  <div class="row" style="margin-bottom:0.8rem">
    <input type="file" accept="application/json,.json" bind:this={fileInput} onchange={seedName}>
    <label class="field"><input type="checkbox" bind:checked={isSpecial}> Special event</label>
  </div>
  <!-- The "Special event" checkbox splits a league round (filed into an open
       series, which already encodes its format) from a standalone special
       event (a one-off type like Hosted qual+race). -->
  {#if !isSpecial}
    <div class="row">
      <label class="field">Series
        <select bind:value={leagueSeries}>
          {#each openSeries as s (s.slug)}<option value={s.slug}>{s.name}{s.status !== 'active' ? ` (${s.status})` : ''}</option>{/each}
        </select>
      </label>
      <label class="field">Round <input type="number" min="1" bind:value={leagueRound}></label>
    </div>
  {:else}
    <div class="row">
      {#if specialTypes.length > 1}
        <label class="field">Type
          <select bind:value={specialType}>
            {#each specialTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="field">Event name <input type="text" placeholder="Bathurst 1000" size="22" bind:value={specialName}></label>
    </div>
  {/if}
  <div class="row" style="margin-top:0.8rem">
    <button class="btn primary" type="button" onclick={upload}>Upload &amp; score</button>
  </div>
  <p class={['msg', uploadMsg.kind]}>{uploadMsg.text}</p>
</section>

<section class="panel">
  <h3>Stored results</h3>
  <p class="desc">Every uploaded session. Download re-exports the original JSON.</p>
  {#if !subs.length}
    <p class="empty">No results uploaded yet.</p>
  {:else}
    <table>
      <thead><tr><th>Series</th><th>Round</th><th>Track</th><th>Date</th><th>Sessions</th><th></th></tr></thead>
      <tbody>
        {#each subs as s (s._id)}
          <tr>
            <td>{#if s.seriesSlug}{seriesName(s.seriesSlug)}{:else}<span class="muted">{s.title || 'Special event'}</span>{/if}</td>
            <td class="pos">{s.round == null ? '—' : s.round}</td>
            <td>{trackOf(s)}</td>
            <td>{fmtDate(s.startTime)}</td>
            <td class="muted">{sessionsOf(s)}</td>
            <td>
              <div class="row">
                <a class="btn sm" href={`/api/admin/subsessions/${encodeURIComponent(s._id)}/download`}>↓ JSON</a>
                <button class="btn sm" type="button" onclick={() => (openPanels[s._id] = !openPanels[s._id])}>Photos</button>
                <button class="btn sm" type="button" title="Headline and paragraph for this result's post on the homepage" onclick={() => togglePostEditor(s)}>Post</button>
                <button class="btn sm danger" type="button" onclick={() => deleteResult(s)}>Delete</button>
              </div>
            </td>
          </tr>
          <!-- Each result row is trailed by a collapsed photo panel. -->
          {#if openPanels[s._id]}
            <tr><td colspan="6"><PhotoPanel sub={s} /></td></tr>
          {/if}
          {#if openPost[s._id]}
            <tr><td colspan="6">
              <div class="row">
                <label class="field">Headline <input type="text" size="48" placeholder="Leave blank for the automatic headline" bind:value={postEdits[s._id].postTitle}></label>
              </div>
              <label class="field intro-field">Paragraph
                <textarea class="intro" placeholder="Optional write-up shown under the headline." bind:value={postEdits[s._id].postBody}></textarea>
              </label>
              <div class="row">
                <button class="btn sm primary" type="button" onclick={() => saveResultPost(s)}>Save post</button>
                <button class="btn sm" type="button" onclick={() => (openPost[s._id] = false)}>Close</button>
              </div>
              <p class={['msg', resultPostMsg[s._id]?.kind ?? '']}>{resultPostMsg[s._id]?.text ?? ''}</p>
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<section class="panel">
  <h3>Series</h3>
  <p class="desc">Each series has an event type (which sets its structure and layout) and a points format. Several can run at once; active series are listed on the site, complete ones stay browsable.</p>
  {#if !series.length}
    <p class="empty">No series yet — create one below.</p>
  {:else}
    <table>
      <thead><tr><th>Name</th><th>Event type</th><th>Status</th><th>Rounds</th><th>Points</th><th>Slug</th></tr></thead>
      <tbody>
        {#each series as s (s.slug)}
          <tr>
            <td>{s.name}</td>
            <td class="muted">{eventTypeName(s.eventType)}</td>
            <td><span class={['badge', s.status]}>{s.status}</span></td>
            <td class="num">{s.schedule?.length ?? 0}</td>
            <td class="muted">{formatName(s.format)}</td>
            <td class="muted">{s.slug}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h4>New series</h4>
  <div class="row">
    <label class="field">Event type
      <select value={newEventType} onchange={pickNewType}>
        {#each seriesTypes as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </label>
    <label class="field">Slug <input type="text" placeholder="fall-2026" size="12" bind:value={newSlug}></label>
    <label class="field">Name <input type="text" placeholder="Fall 2026" size="16" bind:value={newName}></label>
    <label class="field">Rounds <input type="number" min="1" bind:value={newRounds}></label>
    <label class="field" title="Discard each driver's lowest N rounds from the championship total">Drop <input type="number" min="0" bind:value={newDrop}></label>
    <label class="field">Points
      <select bind:value={newFormat}>
        {#each meta.formats as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
      </select>
    </label>
    <button class="btn primary" type="button" onclick={createSeries}>Create</button>
  </div>
  <p class="desc" style="margin-top:0.5rem">{newFormatDesc}</p>
  <p class={['msg', newMsg.kind]}>{newMsg.text}</p>
</section>

<section class="panel">
  <h3>Edit series</h3>
  <div class="row">
    <label class="field">Series
      <select value={editSlug} onchange={(e) => selectSeries(e.currentTarget.value)}>
        {#each series as s (s.slug)}<option value={s.slug}>{s.name} — {eventTypeName(s.eventType)} ({s.status})</option>{/each}
      </select>
    </label>
    <label class="field">Name <input type="text" size="18" bind:value={editName}></label>
    <label class="field">Status
      <select bind:value={editStatus}>
        {#each meta.statuses as st (st)}<option value={st}>{st}</option>{/each}
      </select>
    </label>
    <label class="field" title="Discard each driver's lowest N rounds from the championship total">Drop <input type="number" min="0" bind:value={editDrop}></label>
    <button class="btn primary" type="button" onclick={saveSeries}>Save</button>
    <button class="btn danger sm" type="button" title="Delete this series and every result filed under it (asks you to type the slug)" onclick={deleteSeries}>Delete</button>
  </div>
  <p class={['msg', seriesMsg.kind]}>{seriesMsg.text}</p>

  <h4>Schedule</h4>
  <p class="desc">Track and date per round, shown on the results page until a result is uploaded.</p>
  <div class="sched">
    {#each sched as r, i (r.round)}
      <div class="row">
        <span class="rn">R{r.round}</span>
        <input type="text" placeholder="Track" bind:value={r.track}>
        <input type="text" placeholder="Date (e.g. Thu Oct 2)" bind:value={r.date}>
        <label class="field" title="Double points for this round">2× <input type="checkbox" bind:checked={r.double}></label>
        <button class="btn danger sm" type="button" title="Remove this round from the schedule" onclick={() => sched.splice(i, 1)}>×</button>
      </div>
    {/each}
  </div>
  <div class="row">
    <button class="btn" type="button" onclick={addRound}>+ Round</button>
    <button class="btn primary" type="button" onclick={saveSchedule}>Save schedule</button>
  </div>
  <p class={['msg', schedMsg.kind]}>{schedMsg.text}</p>

  <h4>Points format</h4>
  <p class="desc">Each series scores under its own format. Pick a preset, or edit the JSON for a custom scale (positions → points per session kind; <code>lapLedBonus</code> pays a flat award for leading a lap, once per round across the sprint and feature). Saving rescores every stored result in this series.</p>
  <div class="row" style="margin-bottom:0.6rem">
    <label class="field">Preset
      <select bind:value={editFormat}>
        {#each meta.formats as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
      </select>
    </label>
    <button class="btn" type="button" onclick={applyPreset}>Apply preset &amp; rescore</button>
  </div>
  <textarea spellcheck="false" bind:value={pointsJson}></textarea>
  <div class="row" style="margin-top:0.6rem">
    <button class="btn" type="button" onclick={saveCustom}>Save custom JSON &amp; rescore</button>
  </div>
  <p class={['msg', pointsMsg.kind]}>{pointsMsg.text}</p>
</section>

<section class="panel">
  <h3>Schedule posts</h3>
  <p class="desc">Announce an upcoming season on the homepage feed: pick the season, set the rounds (track, configuration, date), an optional intro, and a carousel of photos chosen from past results.</p>
  {#if !posts.length}
    <p class="empty">No schedule posts yet.</p>
  {:else}
    <table>
      <thead><tr><th>Title</th><th>Season</th><th>Rounds</th><th>Photos</th><th>Published</th><th></th></tr></thead>
      <tbody>
        {#each posts as p (p._id)}
          <tr>
            <td>{p.title}</td>
            <td class="muted">{seriesName(p.seriesSlug)}</td>
            <td class="num">{p.rounds?.length ?? 0}</td>
            <td class="num">{p.photos?.length ?? 0}</td>
            <td>{fmtDate(p.publishedAt)}</td>
            <td>
              <div class="row">
                <button class="btn sm" type="button" onclick={() => editSchedulePost(p)}>Edit</button>
                <button class="btn sm danger" type="button" onclick={() => deleteSchedulePost(p)}>Delete</button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h4 id="postForm">{editingPost ? `Edit schedule post — ${editingPost.title}` : 'New schedule post'}</h4>
  <div class="row">
    <label class="field">Season
      <select bind:value={postSeries} disabled={!!editingPost}>
        {#each series as s (s.slug)}<option value={s.slug}>{s.name} ({s.status})</option>{/each}
      </select>
    </label>
    <label class="field">Title <input type="text" size="18" placeholder="(defaults to season name)" bind:value={postTitle}></label>
    <button class="btn" type="button" onclick={seedPostFromSeries}>Load season schedule</button>
  </div>
  <label class="field intro-field">Intro
    <textarea class="intro" bind:value={postIntro} placeholder="Optional blurb shown above the schedule."></textarea>
  </label>

  <h4>Rounds</h4>
  <div class="sched">
    {#each postRounds as r, i (r.round)}
      <div class="row">
        <span class="rn">R{r.round}</span>
        <input type="text" placeholder="Track" bind:value={r.track}>
        <input type="text" placeholder="Config (e.g. Classic)" bind:value={r.config}>
        <input type="text" placeholder="Date (e.g. 9/17)" bind:value={r.date}>
        <button class="btn danger sm" type="button" title="Remove this round" onclick={() => postRounds.splice(i, 1)}>×</button>
      </div>
    {/each}
  </div>
  <div class="row"><button class="btn" type="button" onclick={addPostRound}>+ Round</button></div>

  <h4>Photos</h4>
  <PhotoPicker {photos} bind:selected={postPhotos} />

  <div class="row" style="margin-top:0.8rem">
    {#if editingPost}
      <button class="btn primary" type="button" onclick={saveSchedulePost}>Save changes</button>
      <button class="btn" type="button" onclick={cancelEditPost}>Cancel</button>
    {:else}
      <button class="btn primary" type="button" onclick={createSchedulePost}>Publish schedule post</button>
    {/if}
  </div>
  <p class={['msg', postMsg.kind]}>{postMsg.text}</p>
</section>
