<script>
  import { enhance } from '$app/forms';
  import PageTitle from '$lib/PageTitle.svelte';

  let { data, form } = $props();
  const current = $derived(data.current);
  const msgFor = (panel) => (form?.panel === panel ? form : null);
  const weatherLabel = { dry: 'Dry', wet: 'Wet', 'dry-to-wet': 'Dry to wet', 'wet-to-dry': 'Wet to dry' };

  // DM-ready line per driver, copied straight into Discord.
  let copied = $state(null);
  async function copyCode(d) {
    await navigator.clipboard.writeText(`Your Analog Racing Club passcode: ${d.code} — pick your track at ${window.location.origin}/track-selection`);
    copied = d.custId;
    setTimeout(() => { if (copied === d.custId) copied = null; }, 1500);
  }
</script>

<svelte:head>
  <title>Track Selection Admin · Analog Racing Club</title>
  <meta name="robots" content="noindex">
</svelte:head>

<div class="topbar">
  <PageTitle inline>Track Selection</PageTitle>
  <a class="btn sm" href="/admin">← Admin</a>
  <a class="btn sm" href="/track-selection">View /track-selection →</a>
</div>

<!-- ---- Current selection ---- -->
<section class="panel">
  <h3>Current selection</h3>
  {#if !current}
    <p class="empty">No track selection yet. Open one below.</p>
  {:else}
    <p class="desc">
      <strong>{current.selection.title}</strong> · {current.picked} of {current.pickers.length} picked ·
      {current.selection.trackTypes.join(', ')}
    </p>
    <table>
      <thead><tr><th>Driver</th><th>Track</th><th>Layout</th><th>Weather</th><th>Format</th><th>Note</th><th>Passcode</th><th></th></tr></thead>
      <tbody>
        {#each current.pickers as d (d.custId)}
          <tr>
            <td>{d.displayName}</td>
            {#if d.pick}
              <td>{d.pick.track}</td>
              <td>{d.pick.shortName} <span class="muted">({d.pick.type}{d.pick.lengthMi ? `, ${d.pick.lengthMi} mi` : ''})</span></td>
              <td>{weatherLabel[d.pick.weather] ?? d.pick.weather}</td>
              <td>{d.pick.variation === 'long' ? 'Long' : 'Standard'}</td>
              <td class="note">{d.pick.notes || '—'}</td>
            {:else}
              <td class="muted" colspan="5">Not yet picked</td>
            {/if}
            <td class="code">{d.code ?? '—'}</td>
            <td>
              <div class="row" style="align-items:center">
                {#if d.code}
                  <button class="btn sm" type="button" onclick={() => copyCode(d)}>{copied === d.custId ? 'Copied ✓' : 'Copy DM'}</button>
                {/if}
                <form method="post" action="?/regenerateCode" use:enhance>
                  <input type="hidden" name="custId" value={d.custId}>
                  <button class="btn sm" type="submit">{d.code ? 'Regenerate' : 'Generate'}</button>
                </form>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="row" style="margin-top:0.8rem">
      <form method="post" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this selection and every pick?')) e.preventDefault(); }}>
        <input type="hidden" name="id" value={current.selection.id}>
        <button class="btn sm danger" type="submit">Delete</button>
      </form>
      {#if msgFor('current')}<span class={msgFor('current').error ? 'err' : 'ok'}>{msgFor('current').error ?? msgFor('current').ok}</span>{/if}
    </div>
  {/if}
</section>

<!-- ---- New selection ---- -->
<section class="panel">
  <h3>New selection</h3>
  <p class="desc">Each chosen driver picks one round on /track-selection: a track and layout of an allowed type, the weather, Standard or Long, and a short note. Opening a new selection replaces the current one on the page; the old one and its picks stay in the database. Picks are not tied to a season. Copy them into the schedule by hand.</p>
  <form method="post" action="?/create" use:enhance>
    <div class="row">
      <label class="field">Title <input type="text" name="title" size="28" placeholder="Winter 26/27 tracks"></label>
    </div>
    <fieldset class="opts">
      <legend>Eligible track types</legend>
      {#each data.trackTypes as t (t)}
        <label class="opt"><input type="checkbox" name="trackTypes" value={t} checked={t === 'Road Course'}> {t}</label>
      {/each}
    </fieldset>
    <fieldset class="opts">
      <legend>Drivers who pick</legend>
      {#each data.drivers as d (d.custId)}
        <label class="opt"><input type="checkbox" name="drivers" value={d.custId}> {d.displayName}</label>
      {/each}
    </fieldset>
    <div class="row" style="margin-top:0.8rem">
      <button class="btn primary" type="submit">Open selection</button>
      {#if msgFor('create')}<span class={msgFor('create').error ? 'err' : 'ok'}>{msgFor('create').error ?? msgFor('create').ok}</span>{/if}
    </div>
  </form>
</section>

<style>
  .ok { color: var(--accent); }
  .err { color: #e05c5c; }
  table { border-collapse: collapse; }
  th, td { text-align: left; padding: 0.4rem 0.9rem 0.4rem 0; border-bottom: 1px solid var(--border); vertical-align: top; }
  .muted { color: var(--muted); }
  td.note { max-width: 18rem; color: var(--muted); font-size: 0.88rem; }
  td.code { font-family: ui-monospace, monospace; letter-spacing: 0.08em; white-space: nowrap; }
  .opts {
    margin-top: 0.8rem; border: 1px solid var(--border); padding: 0.7rem 0.9rem;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.3rem 1rem;
  }
  .opts legend { color: var(--muted); font-size: 0.85rem; padding: 0 0.4rem; }
  .opt { display: flex; align-items: center; gap: 0.45rem; font-size: 0.92rem; }
</style>
