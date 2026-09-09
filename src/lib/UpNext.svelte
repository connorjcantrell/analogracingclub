<script>
  // "Up next": a horizontal banner for the next scheduled round — the round's
  // picture (when it has one) on the left, and beside it the season and round
  // (or "Special event"), the car at the track, and the start in the viewer's
  // zone with the RSVP call to action. The whole banner links to the round's
  // event page, or the Discord invite.
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

<a class={['up-next-banner', { 'no-image': !next.image }]} href={href} target="_blank" rel="noopener">
  {#if next.image}
    <div class="up-next-banner-media"><img src={next.image} alt=""></div>
  {/if}
  <div class="up-next-banner-body">
    <p class="sched-round">{kicker}</p>
    <p class="up-next-banner-title">{next.series.kind} · Round {next.round}</p>
    <p class="up-next-banner-sub">{where}</p>
    <p class="up-next-banner-foot">
      {#if when}<span class="up-next-when">{when}</span>{/if}
      <span class="up-next-cta">RSVP on Discord →</span>
    </p>
  </div>
</a>
