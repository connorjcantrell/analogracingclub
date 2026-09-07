<script>
  // The per-metric record for one matchup: decisive wins in direct meetings.
  // Green for the winner of a metric, red for the loser, cream for a tie.
  import { driverName } from './format.js';
  import { METRIC_LABELS } from './power.js';

  let { aName, bName, record = [] } = $props();
  const rows = $derived(record.filter((m) => m.you + m.them > 0));
  const cls = (a, b) => ['num', { 'rival-win': a > b, 'rival-loss': a < b }];
</script>

{#if !rows.length}
  <p class="rival-empty">Only ties so far — no decisive metric yet.</p>
{:else}
  <table class="rival-table">
    <thead>
      <tr><th>Metric</th><th class="num">{driverName(aName)}</th><th class="num">{driverName(bName)}</th></tr>
    </thead>
    <tbody>
      {#each rows as m (m.metric)}
        <tr>
          <td>{METRIC_LABELS[m.metric] ?? m.metric}</td>
          <td class={cls(m.you, m.them)}>{m.you}</td>
          <td class={cls(m.them, m.you)}>{m.them}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
