<script>
  // Head-to-head panel for one driver: pick any opponent (defaulting to the
  // rival), summarise the matchup, show the per-category record, and load the
  // race-by-race results behind it.
  import MatchupTable from './MatchupTable.svelte';
  import { api } from './api.js';
  import { driverName, fmtDate } from './format.js';

  let { driver, info } = $props();
  // The panel is re-created per driver (keyed by the parent), so the initial
  // pick only needs the props as they are now.
  // svelte-ignore state_referenced_locally
  let oppId = $state(String(info?.rival ?? info?.opponents?.[0]?.custId ?? ''));
  const opp = $derived(info?.opponents.find((o) => String(o.custId) === oppId));
  const isRival = $derived(!!opp && opp.custId === info.rival);
  const matchup = $derived(opp ? api(`/api/power/matchup?a=${driver.custId}&b=${opp.custId}`) : null);

  // A context line above the record: races shared, whether it's the rival, the
  // overall (whole-event) tally, and who leads on categories.
  const summary = $derived.by(() => {
    if (!opp) return '';
    const won = opp.record.filter((m) => m.you > m.them).length;
    const lost = opp.record.filter((m) => m.them > m.you).length;
    const overall = opp.record.find((m) => m.metric === 'overall');
    const lead = won > lost ? `${driverName(driver.displayName)} leads categories ${won}–${lost}`
      : won < lost ? `${driverName(opp.displayName)} leads categories ${lost}–${won}`
      : `level on categories ${won}–${lost}`;
    return [
      `${opp.meetings} race${opp.meetings === 1 ? '' : 's'} together`,
      isRival ? 'their rival' : null,
      overall && overall.you + overall.them > 0 ? `overall ${overall.you}–${overall.them}` : null,
      lead,
    ].filter(Boolean).join(' · ');
  });
</script>

{#if !info || !info.opponents.length}
  <p class="rival-empty">No head-to-head record yet.</p>
{:else}
  <div class="rival">
    <label class="rival-head">Head-to-head vs
      <select class="rival-pick" bind:value={oppId}>
        {#each info.opponents as o (o.custId)}
          <option value={String(o.custId)}>{driverName(o.displayName)} · {o.meetings} race{o.meetings === 1 ? '' : 's'}{o.custId === info.rival ? ' (rival)' : ''}</option>
        {/each}
      </select>
    </label>
    {#if opp}
      <div class="rival-record">
        <p class="rival-summary">{summary}</p>
        <MatchupTable aName={driver.displayName} bName={opp.displayName} record={opp.record} />
        <!-- Every event the two drivers shared, with each one's overall placing
             and who finished ahead — the concrete results behind the record. -->
        {#await matchup}
          <div class="matchup-events"><p class="rival-empty">Loading races…</p></div>
        {:then m}
          {#if m.events?.length}
            <div class="matchup-events">
              <h5 class="matchup-events-title">Race by race</h5>
              <table class="rival-table">
                <thead>
                  <tr><th>Race</th><th class="num">{driverName(driver.displayName)}</th><th class="num">{driverName(opp.displayName)}</th></tr>
                </thead>
                <tbody>
                  {#each m.events as e, i (i)}
                    <tr>
                      <td>{[fmtDate(e.startTime), e.track].filter(Boolean).join(' · ') || '—'}</td>
                      <td class={['num', e.aAhead ? 'rival-win' : 'rival-loss']}>P{e.aOverall}</td>
                      <td class={['num', e.aAhead ? 'rival-loss' : 'rival-win']}>P{e.bOverall}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {:catch}
          <!-- The record above stands on its own. -->
        {/await}
      </div>
    {/if}
  </div>
{/if}
