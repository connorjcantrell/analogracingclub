<script>
  import { enhance } from '$app/forms';
  import PageTitle from '$lib/PageTitle.svelte';
  import { LEAGUE_TZ, wallClock } from '$lib/format.js';

  let { data, form } = $props();
  const current = $derived(data.current);
  const msgFor = (panel) => (form?.panel === panel ? form : null);
  const weatherLabel = $derived(Object.fromEntries(data.weather.map((w) => [w.id, w.label])));
  const variationLabel = $derived(Object.fromEntries(data.variations.map((v) => [v.id, v.label])));
  const fmtAt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: LEAGUE_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const statusLabel = { upcoming: 'Upcoming', open: 'Open — live', closed: 'Closed' };
  const fmtStake = (v) => `${(Math.round((v ?? 0) * 10) / 10).toFixed(1)}%`;
  const defaultSeries = $derived((data.series.find((s) => s.status === 'complete') ?? data.series[0])?.slug);

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
                <!-- Opting out: off the roster, pick deleted, round to the club. Locked once the vote exists. -->
                <form method="post" action="?/removeDriver" use:enhance onsubmit={(e) => { if (!confirm(`Remove ${d.displayName} from the selection? Their pick is deleted and their round goes to a community vote.`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={current.selection.id}>
                  <input type="hidden" name="custId" value={d.custId}>
                  <button class="btn sm danger" type="submit" title="Opted out">Remove</button>
                </form>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if current.removed.length}
      <div class="desc" style="margin-top:0.8rem">
        Opted out, round{current.removed.length === 1 ? '' : 's'} to the community vote:
        {#each current.removed as d (d.custId)}
          <span class="removed">{d.displayName}
            <form method="post" action="?/restoreDriver" use:enhance style="display:inline">
              <input type="hidden" name="id" value={current.selection.id}>
              <input type="hidden" name="custId" value={d.custId}>
              <button class="btn sm" type="submit" disabled={!!current.vote && current.removed.length === 1}>Restore</button>
            </form>
          </span>
        {/each}
      </div>
    {/if}
    <div class="row" style="margin-top:0.8rem">
      <form method="post" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this selection and every pick?')) e.preventDefault(); }}>
        <input type="hidden" name="id" value={current.selection.id}>
        <button class="btn sm danger" type="submit">Delete</button>
      </form>
      {#if msgFor('current')}<span class={msgFor('current').error ? 'err' : 'ok'}>{msgFor('current').error ?? msgFor('current').ok}</span>{/if}
    </div>
  {/if}
</section>

<!-- ---- Community vote ---- -->
{#if current?.removed.length}
  <section class="panel">
    <h3>Community vote</h3>
    {#if !current.vote}
      <p class="desc">
        {current.removed.length === 1 ? 'One round is' : `${current.removed.length} rounds are`} left to the club. The ballot is every eligible layout, by short name,
        on tracks the remaining drivers don't hold. Every driver with a passcode splits their stake (share of the chosen series' points) across layouts by
        clicking: all on one, or evenly over several. {current.removed.length === 1 ? 'The layout with the most stake wins.' : `The top ${current.removed.length} win.`}
        Weather, format and notes are not voted on: set them when the round goes on the schedule.
        Leave the start blank to open immediately; set an end time, or leave it blank and the vote runs for the given number of days. Times are Pacific.
      </p>
      <form method="post" action="?/openVote" use:enhance>
        <input type="hidden" name="id" value={current.selection.id}>
        <div class="row">
          <label class="field">Stake from
            <select name="seriesSlug">
              {#each data.series as s (s.slug)}<option value={s.slug} selected={s.slug === defaultSeries}>{s.name} ({s.status})</option>{/each}
            </select>
          </label>
          <label class="field">Starts (Pacific) <input type="datetime-local" name="startsAt"></label>
          <label class="field">Ends (Pacific) <input type="datetime-local" name="endsAt"></label>
          <label class="field">or days <input type="number" name="days" value="3" min="1" step="0.5" style="width:4.5rem"></label>
        </div>
        <div class="row" style="margin-top:0.8rem">
          <button class="btn primary" type="submit">Open vote</button>
          {#if msgFor('vote')}<span class={msgFor('vote').error ? 'err' : 'ok'}>{msgFor('vote').error ?? msgFor('vote').ok}</span>{/if}
        </div>
      </form>
    {:else}
      {@const v = current.vote}
      <p class="desc">
        {statusLabel[v.status]} · {fmtAt(v.startsAt)} → {fmtAt(v.endsAt)} · stake from <strong>{v.seriesSlug}</strong> ·
        {v.voters} ballot{v.voters === 1 ? '' : 's'} holding {fmtStake(v.staked)} of the pool
        {#if v.winners}· {v.winners.length === 1 ? 'Winner' : v.winners.length === v.slots ? 'Winners' : 'Tie'}: <strong>{v.winners.map((w) => w.name).join(' · ') || '—'}</strong>{/if}
      </p>
      {#if !v.candidates.length}
        <p class="empty">Nothing staked yet.</p>
      {:else}
        <table>
          <thead><tr><th>Layout</th><th class="num">Stake</th><th class="num">Backers</th></tr></thead>
          <tbody>
            {#each [...v.candidates].sort((a, b) => (v.totals[b.id] ?? 0) - (v.totals[a.id] ?? 0)) as c (c.id)}
              <tr>
                <td>{c.name} <span class="muted">({c.type}{c.lengthMi ? `, ${c.lengthMi} mi` : ''})</span></td>
                <td class="num"><strong>{fmtStake(v.totals[c.id])}</strong></td>
                <td class="num">{v.backers[c.id] ?? 0}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <h4>Ballots</h4>
      {#if !current.ballots.length}
        <p class="empty">No ballots saved yet.</p>
      {:else}
        <table>
          <thead><tr><th>Driver</th><th class="num">Stake</th><th>Split</th></tr></thead>
          <tbody>
            {#each current.ballots as b (b.custId)}
              <tr>
                <td>{b.driverName}</td>
                <td class="num">{fmtStake(b.stake)}</td>
                <td class="split">{#each b.split as x, i (x.name)}{#if i}<span class="muted"> · </span>{/if}{x.name} <strong>{x.share}%</strong>{/each}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      {#if current.pending.length && v.status !== 'closed'}
        <p class="desc pending">Not yet staked: {current.pending.join(', ')}</p>
      {/if}

      <form method="post" action="?/rescheduleVote" use:enhance class="row" style="margin-top:0.8rem">
        <input type="hidden" name="id" value={current.selection.id}>
        <label class="field">Starts (Pacific) <input type="datetime-local" name="startsAt" value={wallClock(v.startsAt)}></label>
        <label class="field">Ends (Pacific) <input type="datetime-local" name="endsAt" value={wallClock(v.endsAt)}></label>
        <button class="btn sm" type="submit">Update window</button>
      </form>
      <div class="row" style="margin-top:0.8rem">
        {#if v.status !== 'closed'}
          <form method="post" action="?/closeVote" use:enhance onsubmit={(e) => { if (!confirm('End the vote now and declare the result?')) e.preventDefault(); }}>
            <input type="hidden" name="id" value={current.selection.id}>
            <button class="btn sm" type="submit">End vote now</button>
          </form>
        {/if}
        <form method="post" action="?/deleteVote" use:enhance onsubmit={(e) => { if (!confirm('Delete this vote and every ballot?')) e.preventDefault(); }}>
          <input type="hidden" name="id" value={current.selection.id}>
          <button class="btn sm danger" type="submit">Delete vote</button>
        </form>
        {#if msgFor('vote')}<span class={msgFor('vote').error ? 'err' : 'ok'}>{msgFor('vote').error ?? msgFor('vote').ok}</span>{/if}
      </div>
    {/if}
  </section>
{/if}

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
  th.num, td.num { text-align: right; }
  h4 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  td.split strong { color: var(--accent); }
  .pending { margin-top: 0.6rem; }
  .removed { display: inline-flex; align-items: center; gap: 0.4rem; margin-right: 0.8rem; color: var(--text); }
</style>
