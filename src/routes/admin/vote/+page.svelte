<script>
  import { enhance } from '$app/forms';
  import PageTitle from '$lib/PageTitle.svelte';
  import { LEAGUE_TZ, wallClock } from '$lib/format.js';

  let { data, form } = $props();
  const session = $derived(data.session);
  // Vote times are shown on the league clock (Pacific), with the zone named.
  const fmtAt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: LEAGUE_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const msgFor = (panel) => (form?.panel === panel ? form : null);
  const statusLabel = { upcoming: 'Upcoming', open: 'Open — live', closed: 'Closed' };
  const defaultSeries = $derived((data.series.find((s) => s.status === 'complete') ?? data.series[0])?.slug);

  // DM-ready line per driver, copied straight into Discord.
  let copied = $state(null);
  async function copyCode(d) {
    await navigator.clipboard.writeText(`Your Analog Racing Club car-vote passcode: ${d.code} — vote at ${window.location.origin}/vote`);
    copied = d.custId;
    setTimeout(() => { if (copied === d.custId) copied = null; }, 1500);
  }
</script>

<svelte:head>
  <title>Car Vote Admin · Analog Racing Club</title>
  <meta name="robots" content="noindex">
</svelte:head>

<div class="topbar">
  <PageTitle inline>Car Vote</PageTitle>
  <a class="btn sm" href="/admin">← Admin</a>
  <a class="btn sm" href="/vote">View /vote →</a>
</div>

<!-- ---- Current session ---- -->
<section class="panel">
  <h3>Current vote</h3>
  {#if !session}
    <p class="empty">No vote session yet — create one below.</p>
  {:else}
    <p class="desc">
      <strong>{session.title}</strong> · {statusLabel[session.status]} ·
      {fmtAt(session.startsAt)} → {fmtAt(session.endsAt)} ·
      points from <strong>{session.seriesSlug}</strong> · {session.voters} ballot{session.voters === 1 ? '' : 's'}
      {#if session.winners}· Winner: <strong>{session.winners.join(' · ') || '—'}</strong>{/if}
    </p>
    <!-- Net (for minus against) is what ranks the cars; the halves show how contested each one is. -->
    <table>
      <thead><tr><th>Car</th><th class="num">Net</th><th class="num">For</th><th class="num">Against</th></tr></thead>
      <tbody>
        {#each session.cars as c (c.id)}
          {@const net = session.totals[c.id] ?? 0}
          <tr>
            <td>{c.name}</td>
            <td class="num" class:down={net < 0}><strong>{net < 0 ? `−${-net}` : net}</strong></td>
            <td class="num">{session.up[c.id] ?? 0}</td>
            <td class="num" class:down={(session.down[c.id] ?? 0) > 0}>{session.down[c.id] ?? 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <h4>Ballots</h4>
    {#if !session.ballots.length}
      <p class="empty">No ballots saved yet.</p>
    {:else}
      <table>
        <thead><tr><th>Driver</th><th class="num">Spent</th><th>Split</th></tr></thead>
        <tbody>
          {#each session.ballots as b (b.custId)}
            <tr>
              <td>{b.driverName}</td>
              <td class="num">{b.spent}<span class="muted"> / {data.budgets[b.custId] ?? 0}</span></td>
              <td class="split">{#each b.split as x, i (x.car)}{#if i}<span class="muted"> · </span>{/if}{x.car} <strong class:down={x.pts < 0}>{x.pts > 0 ? `+${x.pts}` : `−${-x.pts}`}</strong>{/each}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if session.pending.length && session.status !== 'closed'}
      <p class="desc pending">Not yet voted: {session.pending.join(', ')}</p>
    {/if}

    <!-- Both pickers are Pacific wall-clock; the server resolves the zone, so a
         countdown set here lands on the league clock whatever the admin's. -->
    <form method="post" action="?/reschedule" use:enhance class="row" style="margin-top:0.8rem">
      <input type="hidden" name="id" value={session.id}>
      <label class="field">Starts (Pacific) <input type="datetime-local" name="startsAt" value={wallClock(session.startsAt)}></label>
      <label class="field">Ends (Pacific) <input type="datetime-local" name="endsAt" value={wallClock(session.endsAt)}></label>
      <button class="btn sm" type="submit">Update window</button>
    </form>

    <div class="row" style="margin-top:0.8rem">
      {#if session.status !== 'closed'}
        <form method="post" action="?/close" use:enhance onsubmit={(e) => { if (!confirm('End the vote now and declare the winner?')) e.preventDefault(); }}>
          <input type="hidden" name="id" value={session.id}>
          <button class="btn sm" type="submit">End vote now</button>
        </form>
      {/if}
      <form method="post" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm('Delete this vote and every ballot?')) e.preventDefault(); }}>
        <input type="hidden" name="id" value={session.id}>
        <button class="btn sm danger" type="submit">Delete</button>
      </form>
      {#if msgFor('session')}<span class={msgFor('session').error ? 'err' : 'ok'}>{msgFor('session').error ?? msgFor('session').ok}</span>{/if}
    </div>
  {/if}
</section>

<!-- ---- New session ---- -->
<section class="panel">
  <h3>New vote</h3>
  <p class="desc">Drivers spend a tenth of their championship points from the chosen series, rounded up (43 pts → 5), casting each vote for or against a car; the highest net score wins. Leave the start blank to open immediately; set an end time, or leave it blank and the vote runs for the given number of days. Times are Pacific.</p>
  <form method="post" action="?/create" use:enhance>
    <div class="row">
      <label class="field">Title <input type="text" name="title" size="28" placeholder="Season 3 car vote"></label>
      <label class="field">Points from
        <!-- Budgets come from final standings, so a finished season is the
             sensible default — an unraced series would give everyone 0. -->
        <select name="seriesSlug">
          {#each data.series as s (s.slug)}<option value={s.slug} selected={s.slug === defaultSeries}>{s.name} ({s.status})</option>{/each}
        </select>
      </label>
      <label class="field">Starts (Pacific) <input type="datetime-local" name="startsAt"></label>
      <label class="field">Ends (Pacific) <input type="datetime-local" name="endsAt"></label>
      <label class="field">or days <input type="number" name="days" value="3" min="1" step="0.5" style="width:4.5rem"></label>
    </div>
    <fieldset class="cars-pick">
      <legend>Eligible cars</legend>
      {#each data.cars as car (car)}
        <label class="car-opt"><input type="checkbox" name="cars" value={car} checked> {car}</label>
      {/each}
    </fieldset>
    <div class="row" style="margin-top:0.8rem">
      <button class="btn primary" type="submit">Create vote</button>
      {#if msgFor('create')}<span class={msgFor('create').error ? 'err' : 'ok'}>{msgFor('create').error ?? msgFor('create').ok}</span>{/if}
    </div>
  </form>
</section>

<!-- ---- Driver passcodes ---- -->
<section class="panel">
  <h3>Driver passcodes</h3>
  <p class="desc">Each driver signs in on /vote with their passcode — Copy puts a DM-ready line on the clipboard. Regenerate kills a leaked code on the spot. Budget is the driver's scaled points in the current vote.</p>
  <div class="row" style="margin-bottom:0.8rem">
    <form method="post" action="?/generateCodes" use:enhance>
      <button class="btn primary" type="submit">Generate missing passcodes</button>
    </form>
    {#if msgFor('codes')}<span class={msgFor('codes').error ? 'err' : 'ok'}>{msgFor('codes').error ?? msgFor('codes').ok}</span>{/if}
  </div>
  {#if !data.codes.length}
    <p class="empty">No drivers yet — passcodes appear once results are uploaded.</p>
  {:else}
    <table>
      <thead><tr><th>Driver</th><th>Passcode</th><th class="num">Budget</th><th></th></tr></thead>
      <tbody>
        {#each data.codes as d (d.custId)}
          <tr>
            <td>{d.displayName}</td>
            <td class="code">{d.code ?? '—'}</td>
            <td class="num muted">{data.session ? `${data.budgets[d.custId] ?? 0} pts` : '—'}</td>
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
  {/if}
</section>

<style>
  .ok { color: var(--accent); }
  .err { color: #e05c5c; }
  table { border-collapse: collapse; }
  th, td { text-align: left; padding: 0.4rem 0.9rem 0.4rem 0; border-bottom: 1px solid var(--border); }
  th.num, td.num { text-align: right; }
  .muted { color: var(--muted); }
  td.code { font-family: ui-monospace, monospace; letter-spacing: 0.08em; }
  h4 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  td.split strong { color: var(--accent); }
  td.down, td.split strong.down { color: #e05c5c; }
  .pending { margin-top: 0.6rem; }
  .cars-pick {
    margin-top: 0.8rem; border: 1px solid var(--border); padding: 0.7rem 0.9rem;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.3rem 1rem;
  }
  .cars-pick legend { color: var(--muted); font-size: 0.85rem; padding: 0 0.4rem; }
  .car-opt { display: flex; align-items: center; gap: 0.45rem; font-size: 0.92rem; }
</style>
