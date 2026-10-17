<script>
  import { enhance } from '$app/forms';
  import PageTitle from '$lib/PageTitle.svelte';

  let { data, form } = $props();
  const session = $derived(data.session);
  const fmtAt = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    <table>
      <thead><tr><th>Car</th><th class="num">Points</th></tr></thead>
      <tbody>
        {#each session.cars as c (c.id)}
          <tr><td>{c.name}</td><td class="num">{session.totals[c.id] ?? 0}</td></tr>
        {/each}
      </tbody>
    </table>
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
  <p class="desc">Drivers spend their final championship points from the chosen series. Leave the start blank to open immediately; the vote runs for the given number of days.</p>
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
      <label class="field">Starts <input type="datetime-local" name="startsAt"></label>
      <label class="field">Days <input type="number" name="days" value="3" min="1" step="0.5" style="width:4.5rem"></label>
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
  <p class="desc">Each driver signs in on /vote with their passcode — Copy puts a DM-ready line on the clipboard. Regenerate kills a leaked code on the spot. Budget is the driver's points in the current vote.</p>
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
  .cars-pick {
    margin-top: 0.8rem; border: 1px solid var(--border); padding: 0.7rem 0.9rem;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.3rem 1rem;
  }
  .cars-pick legend { color: var(--muted); font-size: 0.85rem; padding: 0 0.4rem; }
  .car-opt { display: flex; align-items: center; gap: 0.45rem; font-size: 0.92rem; }
</style>
