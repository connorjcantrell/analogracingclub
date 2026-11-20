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
  <!-- One readout line under the event heading: the Fast Four in qualifying
       order, then who won each race. Groups wrap onto new lines on a phone. -->
  <dl class="readout">
    {#if qualifiers.length}
      <div class="group">
        <dt>{qualifyingPlaces === 4 ? 'Fast Four' : `Top ${qualifyingPlaces} qualifiers`}</dt>
        {#each qualifiers as q (q.finish)}
          <dd><span class="k">Q{q.finish}</span>{q.name}</dd>
        {/each}
      </div>
    {/if}
    {#if winners.length}
      <div class="group">
        <dt>Winners</dt>
        {#each winners as [label, name] (label)}
          <dd><span class="k">{label}</span>{name || '–'}</dd>
        {/each}
      </div>
    {/if}
  </dl>
{/if}

<style>
  .readout {
    display: flex; flex-wrap: wrap; gap: 0.6rem 2.5rem;
    margin: 0 0 1.75rem; padding: 0.9rem 0; border-top: var(--rule); border-bottom: var(--rule);
  }
  .group { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 1.1rem; }
  dt {
    font-family: var(--display); color: var(--muted); font-size: 0.78rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.12em; margin-right: 0.2rem;
  }
  dd {
    margin: 0; font-family: var(--display); font-size: 1.05rem; font-weight: 500; letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .k { color: var(--muted); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; margin-right: 0.4rem; }
  @media (max-width: 640px) {
    .readout { flex-direction: column; gap: 0.8rem; }
    .group { gap: 0.25rem 0.9rem; }
    dt { width: 100%; }
  }
</style>
