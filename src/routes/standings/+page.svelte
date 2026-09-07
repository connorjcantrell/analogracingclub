<script>
  import SeriesPicker from '$lib/SeriesPicker.svelte';
  import { driverName } from '$lib/format.js';

  let { data } = $props();
  const d = $derived(data.standings);
  const subtitle = (s) => [
    `${s.name} · ${s.typeLabel}`,
    (s.dropCount ?? 0) > 0 ? `drops ${s.dropCount} lowest round${s.dropCount > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');
  const EMPTY = 'No results yet — standings appear after the first round.';
</script>

<svelte:head><title>Standings · Analog Racing Club</title></svelte:head>

<div class="page-head">
  <h2>Standings</h2>
  <div><SeriesPicker containers={data.pick.containers} hasSpecial={data.pick.hasSpecial} value={data.pick.slug} /></div>
</div>
{#if d}
  <p class="muted" id="seriesName">{subtitle(d.series)}</p>
{/if}
{#if d?.standings.length}
  <table>
    <thead>
      <tr>
        <th class="pos">Pos</th>
        <th>Driver</th>
        <!-- Each round header deep-links to that round on the results page. -->
        {#each d.rounds as r (r)}
          <th class="num"><a class="round-link" href={`/results?series=${encodeURIComponent(d.series.slug)}&round=${r}`}>R{r}</a></th>
        {/each}
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      {#each d.standings as x, i (x.custId ?? x.displayName)}
        <!-- A dropped round is shown struck through — it does not count toward Total. -->
        {@const dropped = new Set(x.dropped ?? [])}
        <tr>
          <td class="pos">{i + 1}</td>
          <td>{driverName(x.displayName)}</td>
          {#each d.rounds as r (r)}
            {#if x.rounds[r] == null}
              <td class="num muted">—</td>
            {:else}
              <td class={['num', { dropped: dropped.has(r) }]}>{x.rounds[r]}</td>
            {/if}
          {/each}
          <td class="num total">{x.total}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else}
  <p class="empty">{EMPTY}</p>
{/if}

<section class="format-note">
  <h3>Fast Four · Format</h3>
  <p class="format-lead">Each round is three sessions: <strong>Open Qualifying</strong> (10 min), a <strong>Heat Race</strong> (10 min), and the <strong>Feature</strong> (30 min).</p>
  <p class="format-lead">The Heat grid is set by <strong>inverting the top eight qualifiers</strong>: the fastest four are sent to the back of that group, so P1 starts 8th, P2 starts 7th, and so on. Those &ldquo;Fast Four&rdquo; earn bonus points equal to the positions they gave up. The top qualifier drops from 1st to 8th, seven positions, and so gets 7 bonus points.</p>

  <div class="format-grid">
    <div class="format-block">
      <h4>Qualifying</h4>
      <table class="format-table">
        <thead><tr><th>Qualified</th><th>Heat start</th><th class="num">Points</th></tr></thead>
        <tbody>
          <tr><td><span class="pos-chip">P1</span></td><td>P8</td><td class="num">7</td></tr>
          <tr><td><span class="pos-chip">P2</span></td><td>P7</td><td class="num">5</td></tr>
          <tr><td><span class="pos-chip">P3</span></td><td>P6</td><td class="num">3</td></tr>
          <tr><td><span class="pos-chip">P4</span></td><td>P5</td><td class="num">1</td></tr>
        </tbody>
      </table>
    </div>

    <div class="format-block">
      <h4>Heat</h4>
      <p class="format-lead">Your finishing position in the Heat is your starting position in the Feature.</p>
    </div>

    <div class="format-block">
      <h4>Feature</h4>
      <table class="format-table">
        <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
        <tbody>
          <tr><td>1st</td><td class="num">20</td></tr>
          <tr><td>2nd</td><td class="num">18</td></tr>
          <tr><td>3rd</td><td class="num">16</td></tr>
          <tr><td>4th</td><td class="num">14</td></tr>
          <tr><td>5th</td><td class="num">12</td></tr>
          <tr><td>6th–16th</td><td class="num">11 → 1</td></tr>
        </tbody>
      </table>
      <p class="format-lead">The winner of the Feature isn't necessarily the winner of the round. To win a round, you'll need to qualify in the Fast Four and work your way back to the front.</p>
    </div>
  </div>

  <p class="format-lead"><strong>+1 pt for leading a lap</strong> in either the Heat or the Feature. It's awarded once per round, so leading in both races still earns a single point.</p>
</section>
