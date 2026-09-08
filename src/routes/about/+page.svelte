<script>
  import { DISCORD_URL } from '$lib/links.js';
  const CARS = ['Stock cars', 'Vintage GT', 'Vintage formula', 'Australian Supercars'];
</script>

<svelte:head><title>About · Analog Racing Club</title></svelte:head>

<img class="page-logo" src="/assets/logo_cream.png" alt="Analog Racing Club">
<h2>About</h2>

<p class="lede">An iRacing community built around analog cars — no traction control, no
stability control, no ABS — on technical tracks, in challenging conditions, or both.</p>

<section class="about-block">
  <h3>What we race</h3>
  <ul class="chips">
    {#each CARS as c (c)}<li class="chip">{c}</li>{/each}
  </ul>
  <p>Mostly road courses, with the occasional oval. Each season is one car across a handful of
  tracks, so the field learns the machine together rather than chasing a new one every week.</p>
</section>

<section class="about-block">
  <h3>Race night</h3>
  <p>A round is three sessions back to back: open qualifying, a short heat that inverts the
  fastest qualifiers, and the feature. Points reward both speed in qualifying and the drive
  back through the field.</p>
  <p class="latest-more"><a class="link" href="/standings">See the points format →</a></p>
</section>

<section class="about-block" id="join">
  <h3>How to join</h3>
  <div class="join-grid">
    <dl class="join-id">
      <div><dt>League name</dt><dd>Analog Racing Club</dd></div>
      <div><dt>League ID</dt><dd>#12980</dd></div>
    </dl>
    <ol class="join-steps">
      <li>In the iRacing membersite, go to <strong>Racing → Leagues → Find a League</strong>.</li>
      <li>Search for <strong>Analog Racing Club</strong> or League ID <strong>12980</strong>.</li>
      <li>Open the league page and click <strong>Request to Join</strong>.</li>
    </ol>
  </div>
  <p>Race-night RSVPs, announcements, and the post-race chat all live on Discord.</p>
  <a class="discord-btn" href={DISCORD_URL} target="_blank" rel="noopener">
    <img src="/assets/Discord-Symbol-White.svg" alt="">
    <span>Join us on Discord</span>
  </a>
</section>
