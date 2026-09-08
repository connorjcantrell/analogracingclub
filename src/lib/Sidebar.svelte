<script>
  // Desktop-only column beside the feed: the next round, then the season
  // standings (active season) or the power ranking (off-season). See
  // src/lib/server/sidebar.js for how the content is chosen.
  import { driverName } from './format.js';
  import { DISCORD_URL } from './links.js';

  let { sidebar } = $props();
  const next = $derived(sidebar.nextRound);
  const standings = $derived(sidebar.standings);
  const power = $derived(sidebar.power);
  const arrow = (c) => (c ? `${c > 0 ? '▲' : '▼'}${Math.abs(c)}` : '');
</script>

<aside class="home-side">
  {#if next}
    <div class="side-card">
      <h3 class="side-title">Next round</h3>
      {#if next.image}<img class="side-image" src={next.image} alt={next.track ?? `Round ${next.round}`}>{/if}
      <p class="side-kicker">{next.series.name} · R{next.round}{next.date ? ` · ${next.date}` : ''}{next.multiplier > 1 ? ` · ${next.multiplier}× points` : ''}</p>
      <p class="side-track">{next.track ?? 'Track TBA'}</p>
      <!-- The round's own event page when the schedule has one, else Discord. -->
      <a class="link" href={next.link || DISCORD_URL} target="_blank" rel="noopener">{next.link ? 'Event details →' : 'RSVP on Discord →'}</a>
    </div>
  {/if}

  {#if standings}
    <div class="side-card">
      <h3 class="side-title">{standings.series.name} standings</h3>
      {#if standings.rows.length}
        <ol class="side-rows">
          {#each standings.rows as d, i (d.custId)}
            <li>
              <span class="side-pos">{i + 1}</span>
              <span class="side-name">{driverName(d.displayName)}</span>
              {#if d.change}<span class={['chg', d.change > 0 ? 'chg-up' : 'chg-down']}>{arrow(d.change)}</span>{/if}
              <span class="side-val">{d.total}</span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="side-empty">No rounds run yet.</p>
      {/if}
      <a class="link" href={`/standings?series=${encodeURIComponent(standings.series.slug)}`}>Full standings →</a>
    </div>
  {:else if power?.length}
    <div class="side-card">
      <h3 class="side-title">Power rankings</h3>
      <ol class="side-rows">
        {#each power as d, i (d.custId)}
          <li>
            <span class="side-pos">{i + 1}</span>
            <span class="side-name">{driverName(d.displayName)}</span>
            {#if d.change}<span class={['chg', d.change > 0 ? 'chg-up' : 'chg-down']}>{arrow(d.change)}</span>{/if}
          </li>
        {/each}
      </ol>
      <a class="link" href="/drivers">All drivers →</a>
    </div>
  {/if}
</aside>
