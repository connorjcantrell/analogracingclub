<script>
  // The results post for a one-off Special event. Self-contained: it owns its
  // table schema (Pos · Driver · Start · Laps led · Delta · Points) drawn from
  // the deciding race, in finishing order. No Fast Four / championship copy.
  import DriverName from './DriverName.svelte';
  import { driverName, fmtDate, trackName, session, raceSessions, gap, duration, SPECIAL_SLUG } from './format.js';
  import { roundBadges } from './badges.js';

  let { post } = $props();
  const TOP_X = 5;

  const sub = $derived(post.subsession);
  const track = $derived(trackName(sub));
  const hero = $derived(sub.featuredImage || sub.images?.[0]?.url);
  const races = $derived(raceSessions(sub.eventType));
  const raceKind = $derived(races[races.length - 1]?.kind ?? 'feature');
  const all = $derived((session(sub, raceKind)?.results ?? []).slice()
    .sort((a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity)));
  const rows = $derived(all.slice(0, TOP_X));
  const scored = $derived(all.some((x) => (x.points?.total ?? 0) !== 0));
  const badges = $derived(roundBadges(sub, { qualifyingPlaces: 0 }));

  const resultsLink = `/results?series=${encodeURIComponent(SPECIAL_SLUG)}`;

  // The leader shows total race time (derived from average lap × laps, as no
  // absolute finish time is stored); everyone else shows the gap, or laps down.
  function delta(x) {
    if (x.finish === 1) {
      const total = x.averageLapTime && x.lapsComplete ? x.averageLapTime * x.lapsComplete : null;
      return duration(total);
    }
    if (x.interval != null) return gap(x.interval);
    const down = (all.find((r) => r.finish === 1)?.lapsComplete ?? 0) - (x.lapsComplete ?? 0);
    return down > 0 ? `${down} lap${down > 1 ? 's' : ''}` : null;
  }
</script>

<article class="post result-post">
  <p class="sched-round">Special event</p>
  <h2 class="lp-h">{post.title}</h2>
  <p class="lp-sub">{[track, fmtDate(sub.startTime)].filter(Boolean).join(' · ')}</p>
  {#if post.body}<p class="post-body">{post.body}</p>{/if}

  {#if hero}
    <figure class="hero-shot"><img src={hero} alt={sub.title || track || ''}></figure>
  {/if}

  <div class="latest-table">
    {#if !all.length}
      <p class="empty">No results for this event.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th class="pos">Pos</th>
            <th>Driver</th>
            <th class="num">Start</th>
            <th class="num">Laps led</th>
            <th class="num" title="Gap to the leader; the leader shows total race time">Delta</th>
            {#if scored}<th class="num">Points</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as x (x.custId)}
            {@const d = delta(x)}
            <tr>
              <td class="pos"><span class="pos-box">{x.finish == null ? '—' : x.finish}</span></td>
              <td><DriverName name={driverName(x.displayName)} keys={badges.get(x.custId)} /></td>
              <td class="num">{x.start ? `P${x.start}` : '—'}</td>
              <td class={['num', { muted: !x.lapsLead }]}>{x.lapsLead || '—'}</td>
              <td class={['num', { muted: d == null }]}>{d ?? '—'}</td>
              {#if scored}<td class="num total">{x.points?.total ?? 0}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="latest-more"><a class="link" href={resultsLink}>Full results →</a></p>
  </div>
</article>
