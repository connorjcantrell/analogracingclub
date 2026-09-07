<script>
  import MatchupTable from '$lib/MatchupTable.svelte';
  import RivalPanel from '$lib/RivalPanel.svelte';
  import { driverName, ordinal } from '$lib/format.js';
  import { METRIC_COLS } from '$lib/power.js';

  let { data } = $props();
  const drivers = $derived(data.power.drivers);
  const minEvents = $derived(data.power.minEvents);
  // The qualifying (non-provisional) field — the only drivers that define the
  // category ranks.
  const qualifiers = $derived(drivers.filter((d) => !d.provisional));
  const rivals = $derived(new Map(data.rivals.rivals.map((r) => [r.custId, r])));
  const featured = $derived(data.rivals.featured);
  // Mr. Clean: the driver with the fewest incidents per race (recency-weighted,
  // minimum three races).
  const clean = $derived.by(() => {
    const eligible = drivers.filter((d) => d.events >= 3 && d.avgIncidents != null);
    return eligible.length ? eligible.reduce((best, d) => (d.avgIncidents < best.avgIncidents ? d : best)) : null;
  });

  const LIMIT = 10;
  let expanded = $state(false);
  let explain = $state(false);
  // The selected driver's full breakdown replaces the table.
  let detail = $state(null); // { driver, position }

  // A driver's rank in one metric, measured ONLY against qualifying drivers:
  // one plus the number of qualifiers with a better component (ties share a
  // place). Works for a provisional driver too — it shows where they would
  // slot among the qualifiers — without counting them in the field.
  function rankOf(d, key) {
    const v = d.components[key];
    if (v == null) return null;
    return qualifiers.filter((q) => q.components[key] != null && q.components[key] > v).length + 1;
  }
  function select(d, position) {
    detail = { driver: d, position };
    window.scrollTo({ top: 0 });
  }
</script>

<svelte:head><title>Power Rankings · Analog Racing Club</title></svelte:head>

<h2>Power Rankings</h2>
{#if detail}
  {@const d = detail.driver}
  <section>
    <button class="rank-toggle detail-back" type="button" onclick={() => (detail = null)}>← Back to rankings</button>
    <div class="detail-head">
      <span class="detail-pos">{d.provisional ? 'Provisional' : ordinal(detail.position)}</span>
      <span class="detail-name">{driverName(d.displayName)}</span>
      {#if !d.provisional && d.change}
        <span class={['chg', d.change > 0 ? 'chg-up' : 'chg-down']}>{d.change > 0 ? '▲' : '▼'}{Math.abs(d.change)} since last event</span>
      {/if}
    </div>
    <div class="detail-grid">
      <div>
        <h4>Season</h4>
        <dl class="detail-stats">
          {#each [['Races', d.events], ['Wins', d.wins], ['Podiums', d.podiums], ['Avg finish', d.avgFinish], ['Avg overall', d.avgOverall], ['Incidents / race', d.avgIncidents]] as [label, val] (label)}
            <div class="stat-row"><dt>{label}</dt><dd>{val == null ? '—' : val}</dd></div>
          {/each}
        </dl>
      </div>
      <div>
        <h4>Category ranks</h4>
        <div class="detail-cats">
          {#each METRIC_COLS as [key, label] (key)}
            {@const p = rankOf(d, key)}
            <div class="stat-row"><dt>{label}</dt><dd>{p == null ? '—' : ordinal(p)}</dd></div>
          {/each}
        </div>
      </div>
    </div>
    <div class="detail-h2h">
      <h4>Head-to-head</h4>
      {#key d.custId}
        <RivalPanel driver={d} info={rivals.get(d.custId)} />
      {/key}
    </div>
  </section>
{:else}
  <div>
    <p class="rank-note">
      Every driver across every season, rated on recent form. Select a driver for the full breakdown.
      <button class="rank-toggle" type="button" onclick={() => (explain = !explain)}>{explain ? 'Hide' : 'How it works'}</button>
    </p>
    {#if explain}
      <div class="rank-detail">
        <p>The order is built from who beat whom, race by race: every driver’s record against everyone they shared a grid with, judged on how they finished overall, their speed over one lap, their pace over a full run, how many cars they passed, and how often they saw the flag.</p>
        <p>Beating a strong field counts for more than beating a weak one, and two drivers who never met are still placed through the opponents they share. Select a driver for their full breakdown and record against any rival.</p>
        <p>The newest race counts in full and each older one loses ten percent, out to the last ten. Drivers with fewer than {minEvents} races are shown as provisional and listed last.</p>
      </div>
    {/if}
    {#if drivers.length}
      <table>
        <thead><tr><th class="pos">#</th><th>Driver</th></tr></thead>
        <tbody>
          {#each drivers as d, i (d.custId)}
            {#if expanded || i < LIMIT}
              <tr class={['rank-row', { provisional: d.provisional }]} onclick={() => select(d, i + 1)}>
                <!-- Rise/fall in position since the last event. -->
                <td class="pos">{d.provisional ? '—' : i + 1}{#if !d.provisional && d.change}<span class={['chg', d.change > 0 ? 'chg-up' : 'chg-down']}>{d.change > 0 ? '▲' : '▼'}{Math.abs(d.change)}</span>{/if}</td>
                <td>{driverName(d.displayName)}{#if d.provisional}<span class="tag">Provisional</span>{/if}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <!-- Collapse to the top 10 with a toggle to reveal the rest. -->
      {#if drivers.length > LIMIT}
        <button class="rank-toggle see-more" type="button" onclick={() => (expanded = !expanded)}>{expanded ? 'Show top 10' : `See all ${drivers.length} drivers`}</button>
      {/if}
    {:else}
      <p class="empty">No results yet — the ranking appears after the first race.</p>
    {/if}
    <!-- Featured cards below the table: the rivalry of the season is the
         field's most evenly split matchup; Mr. Clean has the fewest incidents. -->
    {#if featured || clean}
      <div class="power-cards">
        {#if featured}
          <div class="power-card">
            <h3 class="power-card-title">Rivalry</h3>
            <p class="power-card-sub">{driverName(featured.a.displayName)} vs {driverName(featured.b.displayName)} · {featured.meetings} races</p>
            <MatchupTable aName={featured.a.displayName} bName={featured.b.displayName} record={featured.record} />
          </div>
        {/if}
        {#if clean}
          <div class="power-card">
            <h3 class="power-card-title">Mr. Clean</h3>
            <p class="power-card-sub">Fewest incidents per race</p>
            <p class="power-card-driver">{driverName(clean.displayName)}</p>
            <p class="power-card-stat">{clean.avgIncidents} inc / race</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
