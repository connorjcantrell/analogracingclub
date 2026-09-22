<script>
  import { DISCORD_URL } from '$lib/links.js';
  const CARS = ['Stock cars', 'Vintage GT', 'Vintage formula', 'Australian Supercars'];
</script>

<svelte:head><title>About · Analog Racing Club</title></svelte:head>

<h2>About</h2>

<p class="lede">An iRacing community built around analog cars (no TC, ESC, or ABS).</p>
<ul class="chips">
  {#each CARS as c (c)}<li class="chip">{c}</li>{/each}
</ul>

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
  <p>To be accepted, drivers need either a Sports Car safety rating of <strong>class A 4.00</strong>
  or a recommendation from a <a class="link" href="/drivers">ranked member</a>.</p>
  <p>Race-night RSVPs, announcements, and the post-race chat all live on Discord.</p>
  <a class="discord-btn" href={DISCORD_URL} target="_blank" rel="noopener">
    <img src="/assets/Discord-Symbol-White.svg" alt="">
    <span>Join us on Discord</span>
  </a>
</section>
