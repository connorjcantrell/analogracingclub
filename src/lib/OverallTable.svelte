<script>
  // Points across a round: one column per session the event type declares,
  // labelled by the type (so a league round reads Heat, a hosted round reads
  // Race), ordered by total, and Points only when the round was scored. Shared
  // by the results page; the homepage feed's per-type posts render their own
  // tables (see FastFourPost / SpecialEventPost).
  import { driverName, sessionKindsOf, sessionLabel, roundTable, posCell } from './format.js';
  import { roundBadges } from './badges.js';
  import DriverName from './DriverName.svelte';

  let { sub, mult = 1, limit = Infinity, qualifyingPlaces = 0 } = $props();
  const kinds = $derived(sessionKindsOf(sub.eventType));
  const rows = $derived(roundTable(sub).slice(0, limit));
  const scored = $derived(roundTable(sub).some((d) => d.total !== 0));
  const badges = $derived(roundBadges(sub, { qualifyingPlaces }));
</script>

<table>
  <thead>
    <tr>
      <th class="pos">Pos</th>
      <th>Driver</th>
      {#each kinds as k (k)}<th class="num">{sessionLabel(sub.eventType, k)}</th>{/each}
      {#if scored}<th class="num">{mult > 1 ? 'Points 2×' : 'Points'}</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each rows as d, i (d.custId)}
      <tr>
        <td class="pos"><span class="pos-box">{i + 1}</span></td>
        <td><DriverName name={driverName(d.name)} keys={badges.get(d.custId)} /></td>
        {#each kinds as k (k)}<td class="num">{posCell(d[k])}</td>{/each}
        {#if scored}<td class="num total">{d.total * mult}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
