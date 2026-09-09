<script>
  // "Up next": the next scheduled round, styled like the other feed posts. A
  // two-line title — the season and round (or "Special event") and the car at the track
  // — above the round's picture (when it has one), then the start in the
  // viewer's zone beside the RSVP link to its event page or the Discord invite.
  import { DISCORD_URL } from './links.js';
  import { fmtStartTime, countdown, LEAGUE_TZ } from './format.js';

  let { next } = $props();
  const href = $derived(next.link || DISCORD_URL);
  // The start time is shown in the viewer's own zone, which only the browser
  // knows: the server renders the league zone and the client swaps it in. The
  // countdown likewise lives in the browser, refreshed every half minute.
  let viewerTz = $state(LEAGUE_TZ);
  let now = $state(null);
  $effect(() => {
    viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || LEAGUE_TZ;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const soon = $derived(now == null ? null : countdown(next.startTime, now));
  const when = $derived(fmtStartTime(next.startTime, viewerTz) ?? next.date ?? null);
  const track = $derived(next.track ?? 'Track TBA');
  const where = $derived(next.series.car ? `${next.series.car} at ${track}` : track);
  const kicker = $derived(['Up next', next.multiplier > 1 ? `${next.multiplier}× points` : null, soon].filter(Boolean).join(' · '));
</script>

<article class="post up-next">
  <p class="sched-round">{kicker}</p>
  <h2 class="lp-h up-next-title">
    <span class="up-next-kind">{next.series.kind} · Round {next.round}</span>
    <span>{where}</span>
  </h2>
  {#if next.image}
    <a class="up-next-media" href={href} target="_blank" rel="noopener" aria-label={`${next.series.kind}: ${where}`}>
      <img class="up-next-image" src={next.image} alt="">
    </a>
  {/if}
  <p class="latest-more up-next-foot">
    {#if when}<span class="up-next-when">{when}</span>{/if}
    <a class="link" href={href} target="_blank" rel="noopener">RSVP on Discord →</a>
  </p>
</article>
