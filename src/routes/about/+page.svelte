<script>
  import { DISCORD_URL } from '$lib/links.js';
  import FormatExplainer from '$lib/FormatExplainer.svelte';
  import { FORMAT_SECTIONS } from '$lib/format-sections.js';

  // The contents: each section, and under Format its subsections.
  const SECTIONS = [
    ['general', 'General'],
    ['culture', 'Culture'],
    ['stake', 'Stake'],
    ['format', 'Format', FORMAT_SECTIONS],
    ['apply', 'How to Apply'],
  ];
  // The driving rules. The lead-in is the short sentence shown in bold.
  const RULES = [
    ['Stay clear of drivers on a hot lap in qualifying.', 'If you are on an out lap, in lap, or cool down lap, stay off the racing line and do not impede anyone on a hot lap.'],
    ['The overtaking car owns the pass.', 'The driver behind is responsible for making a clean move, and must have meaningful overlap before the turn-in point to claim the corner.'],
    ['Defend with one move.', 'The lead driver may choose a defensive line, but must commit to it before the braking zone and may make only one move.'],
    ['Leave a car width when side by side.', 'Give the other driver at least one full car width on their side until one of you is clear.'],
    ['Give the place back.', 'If you gain a position through contact, hand it back on track as soon as it is safe to do so.'],
    ['Lapped cars must not impede.', 'A driver being lapped holds a predictable line and lets the faster car through at the first safe opportunity, without defending the position.'],
  ];
</script>

<svelte:head><title>About · Analog Racing Club</title></svelte:head>

<h2>About</h2>

<!-- The page is the club’s reference, in five sections; this jumps to each. -->
<nav class="toc" aria-label="On this page">
  <ol>
    {#each SECTIONS as [id, label, subs] (id)}
      <li>
        <a class="link" href="#{id}">{label}</a>
        {#if subs}<ol>{#each subs as [sid, slabel] (sid)}<li><a class="link" href="#{sid}">{slabel}</a></li>{/each}</ol>{/if}
      </li>
    {/each}
  </ol>
</nav>

<section class="about-block" id="general">
  <h3>General</h3>
  <p class="lede">Analog Racing Club is an iRacing community built on one premise: if a car has TC or ABS, we don’t race it. We race stock cars, Australian Supercars, vintage GT, and vintage formula. We prefer road courses but aren’t opposed to ovals.</p>
</section>

<section class="about-block" id="culture">
  <h3>Culture</h3>
  <p>We are a club with no race officials and no penalties, so respect for each other comes first. Race hard, but treat other drivers like teammates. Avoiding contact matters more than gaining a position. Settle incidents directly and respectfully after the race. If a driver is repeatedly too aggressive, the club decides together how to address it.</p>
  <ol class="rules">
    {#each RULES as [lead, rest] (lead)}<li><strong>{lead}</strong> {rest}</li>{/each}
  </ol>
</section>

<section class="about-block" id="stake">
  <h3>Stake</h3>
  <p>What we drive and where we race is decided by the club’s stakeholders, and anyone who drives becomes one. How much say you have is your <a class="link" href="/stake">Stake</a>, and it is earned one season at a time.</p>
  <p>Seasons follow the calendar: Spring, Summer, Fall, and Winter. Each has an official championship, plus single sessions and special events open to anyone in the club. All of them pay points, and your Stake is your share of every point paid out that season.</p>
  <p>As a season nears its end, voting opens, and your Stake becomes your weight in it. The <a class="link" href="/vote">car vote</a> decides what the next championship races. The <a class="link" href="/track-selection">schedule</a> is set round by round, each track chosen by a top driver in the championship or by community vote. Then Stake resets to zero and everyone starts the new season level.</p>
</section>

<section class="about-block" id="format">
  <h3>Format</h3>
  <FormatExplainer />
</section>

<section class="about-block" id="apply">
  <h3>How to Apply</h3>
  <p>Analog Racing Club is referral only. A current member can vouch for you, and that is the usual way in.</p>
  <p>If you don’t know a member, you can still apply if you hold an iRacing A class license with a safety rating of 4.5 or higher.</p>
  <p>To apply, <a class="link" href={DISCORD_URL} target="_blank" rel="noopener">join the Discord</a> and tell us who referred you or share your iRacing profile.</p>
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
</section>
