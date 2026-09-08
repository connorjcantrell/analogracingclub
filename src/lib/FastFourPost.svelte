<script>
  // The results post for a Fast Four league round. Self-contained: it owns its
  // table schema (Pos · Driver · Feature · Positions Gained · Points) and the
  // inline Fast Four strip. Nothing here is shared with other event types'
  // posts, so the schema can diverge freely per type.
  import DriverName from './DriverName.svelte';
  import { driverName, fmtDate, roundTable, roundPositionsGained, posCell, signed, cardsOf, topQualifiers } from './format.js';
  import { roundBadges } from './badges.js';

  let { post } = $props();
  const TOP_X = 5;

  const series = $derived(post.series);
  const sub = $derived(post.subsession);
  const hero = $derived(sub.featuredImage || sub.images?.[0]?.url);
  const qualifyingPlaces = $derived(series?.qualifyingPlaces ?? 0);

  const rows = $derived(roundTable(sub).slice(0, TOP_X));
  const scored = $derived(roundTable(sub).some((d) => d.total !== 0));
  const badges = $derived(roundBadges(sub, { qualifyingPlaces }));

  const fastFour = $derived(cardsOf(sub.eventType).includes('fast-four') ? topQualifiers(sub, qualifyingPlaces) : []);
  const ffLabel = $derived(qualifyingPlaces === 4 ? 'Fast Four' : `Top ${qualifyingPlaces}`);

  const kicker = $derived([series?.typeLabel, series?.name, series?.singleRound || sub.round == null ? null : `Round ${sub.round}`].filter(Boolean).join(' · '));
  const resultsLink = $derived(`/results?series=${encodeURIComponent(series?.slug ?? '')}&round=${sub.round ?? ''}`);
</script>

<article class="post result-post">
  <p class="sched-round">{kicker}</p>
  <h2 class="lp-h">{post.title}</h2>
  <p class="lp-sub">{fmtDate(sub.startTime)}</p>
  {#if post.body}<p class="post-body">{post.body}</p>{/if}

  {#if fastFour.length}
    <p class="fast-four-inline">
      <span class="ff-label">{ffLabel}</span>
      {#each fastFour as q (q.finish)}
        <span class="ff-name"><b>Q{q.finish}</b>{q.name}</span>
      {/each}
      <button type="button" class="ff-info"
        aria-label="The fastest qualifiers, whose grid was inverted so they started from the back."
        title="The fastest qualifiers, whose grid was inverted so they started from the back.">?</button>
    </p>
  {/if}

  {#if hero}
    <figure class="hero-shot"><img src={hero} alt={sub.track?.name ?? ''}></figure>
  {/if}

  <div class="latest-table">
    <table>
      <thead>
        <tr>
          <th class="pos">Pos</th>
          <th>Driver</th>
          <th class="num" title="Positions gained from the heat grid to the feature finish">Positions Gained</th>
          <th class="num">Feature</th>
          {#if scored}<th class="num">Points</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each rows as d, i (d.custId)}
          {@const gained = roundPositionsGained(d)}
          <tr>
            <td class="pos"><span class="pos-box">{i + 1}</span></td>
            <td><DriverName name={driverName(d.name)} keys={badges.get(d.custId)} /></td>
            <td class={['num', 'gained', { up: gained > 0, down: gained < 0 }]}>{signed(gained)}</td>
            <td class="num">{posCell(d.feature)}</td>
            {#if scored}<td class="num total">{d.total}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="latest-more"><a class="link" href={resultsLink}>Full results →</a></p>
  </div>
</article>
