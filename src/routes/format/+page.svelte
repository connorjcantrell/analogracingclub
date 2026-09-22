<script>
  import { ordinal } from '$lib/format.js';

  // The ARC standard scale (mirrors the 'fast-four' preset in
  // src/lib/server/scoring/formats.js — a server module, so the numbers are
  // repeated here rather than imported).
  const QUAL_PTS = [7, 5, 3, 1];
  const FEATURE_PTS = [20, 18, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const LED_BONUS = 1;
  const INVERTED = 8;
  // The heat grid: the top eight qualifiers reversed, everyone else where they qualified.
  const heatStart = (q) => (q <= INVERTED ? INVERTED + 1 - q : q);
  const qualPts = (q) => QUAL_PTS[q - 1] ?? 0;
  const featurePts = (f) => FEATURE_PTS[f - 1] ?? 0;

  // A feature winner always leads the last lap, so a winner from outside the
  // Fast Four scores exactly 20 + 1. Every Fast Four driver is racing that number.
  const BENCHMARK = featurePts(1) + LED_BONUS;
  // The 1st place qualifier's round total by feature finish, against that benchmark.
  const firstLine = [1, 2, 3, 4, 5].map((f) => {
    const total = qualPts(1) + featurePts(f) + (f === 1 ? LED_BONUS : 0);
    return { f, total, verdict: total > BENCHMARK ? 'wins' : total === BENCHMARK ? 'level' : 'loses' };
  });
  // For each Fast Four place, the worst feature finish that still beats the benchmark.
  const fastFourLine = QUAL_PTS.map((_, i) => {
    const q = i + 1;
    let f = 1;
    while (f < FEATURE_PTS.length && qualPts(q) + featurePts(f + 1) > BENCHMARK) f++;
    return { q, pts: qualPts(q), start: heatStart(q), needs: f };
  });
</script>

<svelte:head><title>Fast Four Format · Analog Racing Club</title></svelte:head>

<h2>Fast Four Format</h2>

<section class="about-block format-explainer">
  <p>Three sessions. Qualifying sets the heat grid, the heat sets the feature grid, and the round
  goes to whoever scores the most points across the night, which is not always the feature winner.</p>

  <div class="scroll-x">
    <table class="sessions-table">
      <thead><tr><th>Session</th><th>Length</th></tr></thead>
      <tbody>
        <tr><td class="lead">Qualifying</td><td>10 min</td></tr>
        <tr><td class="lead">Heat</td><td>10 min</td></tr>
        <tr><td class="lead">Feature</td><td>30 min</td></tr>
      </tbody>
    </table>
  </div>

  <h3>The Invert</h3>
  <p>The top eight qualifiers are reversed for the heat. The 1st place qualifier starts 8th, the 2nd
  place qualifier starts 7th, and so on through the 8th place qualifier, who starts 1st. Everyone
  from 9th back starts where they qualified. The <strong>Fast Four</strong> are the four inverted
  backward, and they earn one point for each place the invert costs them.</p>
  <div class="scroll-x">
    <table class="format-table invert-table">
      <thead><tr><th>Qualified</th><th>Heat start</th><th class="num">Points</th></tr></thead>
      <tbody>
        {#each Array.from({ length: INVERTED }, (_, i) => i + 1) as q (q)}
          <tr>
            <td><span class="pos-chip" class:start={q <= QUAL_PTS.length}>{ordinal(q)}</span></td>
            <td>{ordinal(heatStart(q))}</td>
            <td class="num">{qualPts(q) || '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>The heat</h3>
  <p>The heat pays no finishing points. Where you finish the heat is where you start the feature:
  finish 3rd and you line up 3rd for the feature. The Fast Four spend the heat winning back the
  places the invert cost them. The drivers inverted forward defend their spot on the feature grid
  and fight for the lead, since leading a lap of the heat is worth a bonus point.</p>

  <h3>Leading a lap</h3>
  <p>Lead a lap of the heat or the feature and you score <strong>1 bonus point</strong>. It is awarded
  once per round, so leading in both races still earns a single point.</p>

  <h3>The feature</h3>
  <p>The feature pays the finishing points that decide the round. Getting into the top four, and
  every place gained inside it, is worth two points; from 5th back, each place is worth one.</p>
  <div class="scroll-x">
    <table class="format-table">
      <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
      <tbody>
        {#each FEATURE_PTS.slice(0, 5) as pts, i (i)}
          <tr><td>{ordinal(i + 1)}</td><td class="num">{pts}</td></tr>
        {/each}
        <tr><td>6th to {ordinal(FEATURE_PTS.length)}</td><td class="num">{FEATURE_PTS[5]} down to {FEATURE_PTS.at(-1)}</td></tr>
      </tbody>
    </table>
  </div>

  <h3>Why</h3>
  <ul class="why">
    <li><strong>Qualifying points reward the push.</strong> A fast lap costs you grid slots, so it pays
    you up front: exactly one point for each place inverted. The 1st place qualifier drops seven places and scores 7; 4th
    drops one and scores 1. Those points are yours before the racing starts.</li>
    <li><strong>Leading pays, once.</strong> Take the lead in either race, even for a lap, and you score
    a point. It is capped at one per round so it decides close rounds without dominating them.</li>
    <li><strong>The top four pay double in the feature.</strong> Getting into the top four of the feature, and every
    place gained inside it, is worth two points; from 5th back each place is worth one. That premium
    goes to whoever finishes in the top four, whether by defending after inverting forward or by
    winning back the places lost after inverting backward.</li>
  </ul>

  <h3>Where the line is</h3>
  <p>A feature winner from outside the Fast Four scores <strong>{BENCHMARK}</strong>: 20 for the win
  and 1 for leading the last lap. The 1st place qualifier has 7 banked and starts the heat 8th. Against
  that {BENCHMARK}-point winner, the round comes down to where the 1st place qualifier finishes the feature.</p>
  <div class="scroll-x">
    <table class="format-table line-table">
      <thead><tr><th>Feature finish</th><th class="num">Round total</th><th>Result</th></tr></thead>
      <tbody>
        {#each firstLine as r (r.f)}
          <tr class={r.verdict}>
            <td>{r.f === 1 ? 'Wins the feature' : ordinal(r.f)}</td>
            <td class="num total">{r.total}</td>
            <td><span class="tag {r.verdict}">{r.verdict === 'wins' ? 'Wins the round' : r.verdict === 'level' ? 'Tie' : 'Loses the round'}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p>The line is <strong>3rd</strong>: five places gained across the heat and the feature. Lead a lap of
  the heat along the way and 4th is enough. If another Fast Four driver finishes ahead, their banked
  points raise the bar: a 2nd place qualifier who wins the feature scores
  <strong>{qualPts(2) + featurePts(1) + LED_BONUS}</strong>.</p>
  <p>The rest of the Fast Four have less banked, so against the same {BENCHMARK}-point winner they need:</p>
  <div class="scroll-x">
    <table class="format-table line-table">
      <thead><tr><th>Qualified</th><th class="num">Banked</th><th>Needs to finish</th></tr></thead>
      <tbody>
        {#each fastFourLine as r (r.q)}
          <tr>
            <td><span class="pos-chip start">{ordinal(r.q)}</span></td>
            <td class="num">{r.pts}</td>
            <td>{r.needs === 1 ? 'Must win the feature' : `${ordinal(r.needs)} or better`}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

</section>

<style>
  /* The About page's prose rhythm, with the standings page's format tables dropped in. */
  .format-explainer h3 {
    color: var(--accent); font-size: 1.05rem; letter-spacing: 0.1em;
    margin: 2.2rem 0 0.7rem;
  }
  .format-explainer p strong, .format-explainer li strong { color: var(--accent); font-weight: 500; }
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  .sessions-table { margin: 0.4rem 0 0.6rem; font-size: 0.92rem; }
  .sessions-table td { vertical-align: top; }
  .sessions-table td.lead { font-family: var(--display); font-size: 1rem; letter-spacing: 0.02em; white-space: nowrap; }
  .invert-table { margin: 0.4rem 0 0.6rem; }

  .why { padding-left: 1.3rem; margin: 0 0 1rem; }
  .why li { margin: 0 0 0.6rem; line-height: 1.6; }
  .why li::marker { color: var(--accent); }

  .line-table { margin: 0.4rem 0 1rem; font-size: 0.92rem; }
  .line-table th, .line-table td { white-space: nowrap; }
  .line-table tr.loses td { color: var(--muted); }
  .tag {
    display: inline-block; padding: 0.1rem 0.5rem; border: 1px solid var(--border);
    font-family: var(--display); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--muted);
  }
  .tag.wins { border-color: var(--green); color: var(--green); }
  .tag.level { border-color: var(--accent); color: var(--accent); }
</style>
