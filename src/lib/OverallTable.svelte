<script>
  // Points across a round: one column per session the event type declares,
  // labelled by the type (so a league round reads Heat, a hosted round reads
  // Race), ordered by total, and Points only when the round was scored.
  import { driverName, sessionKindsOf, sessionLabel, roundTable, posCell } from './format.js';

  let { sub, mult = 1, limit = Infinity } = $props();
  const kinds = $derived(sessionKindsOf(sub.eventType));
  const rows = $derived(roundTable(sub).slice(0, limit));
  const scored = $derived(roundTable(sub).some((d) => d.total !== 0));
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
        <td class="pos">{i + 1}</td>
        <td>{driverName(d.name)}</td>
        {#each kinds as k (k)}<td class="num">{posCell(d[k])}</td>{/each}
        {#if scored}<td class="num total">{d.total * mult}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
