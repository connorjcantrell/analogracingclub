<script>
  // Summary cards, keyed by the ids the event type declares. The backend owns
  // which cards appear; this component owns how they look. Renders nothing
  // when no declared card has anything to say.
  import { cardsOf, raceSessions, topQualifiers, winner, overallWinner } from './format.js';

  // `overall` adds an "Overall" row to the winners card when the round combined
  // more than one race (the homepage does this; the results page does not).
  let { sub, qualifyingPlaces = 0, overall = false } = $props();

  const ids = $derived(cardsOf(sub.eventType));
  // Who made the Fast Four — the qualifying places the format pays. Four
  // places keeps the name; any other count is described generically.
  const qualifiers = $derived(ids.includes('fast-four') ? topQualifiers(sub, qualifyingPlaces) : []);
  // The winner of each race the event ran, by the event type's labels.
  const winners = $derived.by(() => {
    if (!ids.includes('heat-feature-winners')) return [];
    const rows = raceSessions(sub.eventType).map((s) => [s.label, winner(sub, s.kind)]);
    if (overall && rows.length > 1) rows.push(['Overall', overallWinner(sub)]);
    return rows;
  });
</script>

{#if qualifiers.length || winners.length}
  <div class="cards">
    {#if qualifiers.length}
      <div class="card">
        <h3 class="card-title">{qualifyingPlaces === 4 ? 'Fast Four' : `Top ${qualifyingPlaces} qualifiers`}</h3>
        <dl class="card-rows">
          {#each qualifiers as q (q.finish)}
            <div class="card-row"><dt>Q{q.finish}</dt><dd>{q.name}</dd></div>
          {/each}
        </dl>
      </div>
    {/if}
    {#if winners.length}
      <div class="card">
        <h3 class="card-title">Winners</h3>
        <dl class="card-rows">
          {#each winners as [label, name] (label)}
            <div class="card-row"><dt>{label}</dt><dd>{name || '—'}</dd></div>
          {/each}
        </dl>
      </div>
    {/if}
  </div>
{/if}
