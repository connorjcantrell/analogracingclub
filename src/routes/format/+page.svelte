<script>
  import { ordinal } from '$lib/format.js';

  // The ARC standard scale (mirrors the 'fast-four-v2' preset in
  // src/lib/server/scoring/formats.js, a server module, so the numbers are
  // repeated here rather than imported).
  const QUAL_PTS = [7, 5, 3, 1];
  const FEATURE_PTS = [22, 19, 17, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, ...Array(16).fill(1)];
  // The scale is listed place by place down to 16th; 17th onward all pay the
  // same point, so they share one row.
  const LISTED = 16;
  const LAST = FEATURE_PTS.length;
  const INVERTED = 8;
  // The heat grid: the top eight qualifiers reversed, everyone else where they qualified.
  const heatStart = (q) => (q <= INVERTED ? INVERTED + 1 - q : q);
  const qualPts = (q) => QUAL_PTS[q - 1] ?? 0;
  const featurePts = (f) => FEATURE_PTS[f - 1] ?? 0;
  const LED_BONUS = 1;

  // The ceiling and the benchmark. A sweep is pole, the feature win and the lap
  // led. A feature winner always leads a lap, so a driver inverted forward with
  // nothing banked scores the win plus the bonus; the pole-sitter's banked
  // points mean the first feature finish that beats that number is the line.
  const SWEEP = qualPts(1) + featurePts(1) + LED_BONUS;
  const WINNER = featurePts(1) + LED_BONUS;
  const LINE = FEATURE_PTS.findLastIndex((pts) => qualPts(1) + pts > WINNER) + 1; // the lowest finish that still beats it
  const LINE_TOTAL = qualPts(1) + featurePts(LINE);
</script>

<svelte:head><title>Fast Four Format · Analog Racing Club</title></svelte:head>

<h2>Fast Four Format</h2>

<!-- The format explained top to bottom: the night's three sessions, then each
     session's rules and the points it pays. -->
<section class="format-explainer">
  <p>Road racing gets strung out. A few laps in, the field has sorted itself by pace, the gaps open up, and
  most drivers spend the rest of the race alone. An invert fixes that by putting the fastest cars in traffic.
  But a plain invert punishes speed: if qualifying on pole only costs you grid spots, nobody tries, and the
  invert falls apart. Being inverted has to be worth it.</p>
  <p>The Fast Four format is built around that trade. The quickest qualifiers bank points for the places the
  invert takes from them, then have to pass their way back to the front. It's designed to produce the best
  racing product we can, one where winning a round takes race craft, not just a fast lap. Rounds are run as
  either Standard or Long, and the points table is the same either way.</p>

  <h3>Open Qualifying</h3>
  <p>Qualifying is a 10-minute open session. The top eight qualifiers are inverted for the opening race, so
  pole starts 8th. The top four qualifiers, the <strong>Fast Four</strong>, get points for the grid spots the
  invert costs them.</p>
  <div class="scroll-x">
    <table class="format-table invert-table">
      <thead><tr><th>Qualified</th><th>Starts</th><th class="num">Points</th><th class="ff-col" aria-hidden="true"></th></tr></thead>
      <tbody>
        {#each Array.from({ length: INVERTED }, (_, i) => i + 1) as q (q)}
          <tr>
            <td><span class="pos-chip" class:start={q <= QUAL_PTS.length}>{ordinal(q)}</span></td>
            <td>{ordinal(heatStart(q))}</td>
            <td class="num">{qualPts(q)}</td>
            {#if q === 1}
              <td class="ff-bracket" rowspan={QUAL_PTS.length}><span>Fast Four</span></td>
            {:else if q > QUAL_PTS.length}
              <td class="ff-col"></td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>Standard and Long</h3>
  <p><strong>Standard:</strong> a 10-minute heat, then a 20-minute feature.</p>
  <ul>
    <li><strong>Heat:</strong> Starts from the inverted grid. It pays no points. Your heat finish sets your feature grid.</li>
    <li><strong>Feature:</strong> 20 minutes, paid on the table below.</li>
  </ul>
  <p><strong>Long:</strong> No heat. One 40-minute feature that starts from the inverted grid, with limited
  fuel, so every driver has to make a pit stop.</p>

  <h3>Feature Points</h3>
  <div class="scroll-x">
    <table class="format-table feature-table">
      <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
      <tbody>
        {#each FEATURE_PTS.slice(0, LISTED) as pts, i (i)}
          <tr><td>{ordinal(i + 1)}</td><td class="num">{pts}</td></tr>
        {/each}
        <tr><td>{ordinal(LISTED + 1)} to {ordinal(LAST)}</td><td class="num">{FEATURE_PTS[LISTED]}</td></tr>
      </tbody>
    </table>
  </div>
  <p><strong>Lap led bonus:</strong> Lead a lap in any race and you get +{LED_BONUS}. It's paid once per round,
  however many races you lead.</p>

  <h3>Where the Line Is</h3>
  <ul>
    <li><strong>Sweep:</strong> pole, the feature win and a lap led add up to {SWEEP} points
    ({qualPts(1)} + {featurePts(1)} + {LED_BONUS}). Nothing pays more.</li>
    <li><strong>Winning from the inverted front:</strong> a driver who starts up front, wins the feature and
    leads a lap gets {WINNER} ({featurePts(1)} + {LED_BONUS}).</li>
    <li><strong>The pole sitter's target:</strong> with {qualPts(1)} points banked from starting
    {ordinal(heatStart(1))}, the fastest qualifier needs {ordinal(LINE)} in the feature to beat that
    ({qualPts(1)} + {featurePts(LINE)} = {LINE_TOTAL}). {ordinal(LINE + 1)} gets them
    {qualPts(1) + featurePts(LINE + 1)}, which isn't enough.</li>
  </ul>
</section>

<style>
  /* One rhythm for the whole page: prose at the site's reading size, and every
     table the same width, type size and left edge, so the eye drops straight
     down the page without the tables jumping about. */
  .format-explainer { --table-w: 26rem; }
  .format-explainer h3 {
    color: var(--accent); font-size: 1.05rem; letter-spacing: 0.1em;
    margin: 2.6rem 0 0.8rem;
  }
  .format-explainer p { margin: 0 0 0.8rem; max-width: 62ch; line-height: 1.6; }
  .format-explainer ul { margin: 0 0 1rem; padding-left: 1.3rem; max-width: 62ch; }
  .format-explainer li { margin: 0 0 0.5rem; line-height: 1.6; }
  .format-explainer li::marker { color: var(--accent); }
  .format-explainer li strong { color: var(--accent); font-weight: 500; }
  .format-explainer p strong { color: var(--accent); font-weight: 500; }
  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 1rem 0 0.4rem; }

  /* Tables sit at the body size, not smaller, so they carry the same weight as
     the paragraphs around them. Fixed layout keeps the columns steady: the
     label column takes the left half and the figures right-align on one edge. */
  .format-table {
    width: 100%; max-width: var(--table-w); table-layout: fixed; border-collapse: collapse;
    font-size: 1rem; margin: 0;
  }
  .format-table th, .format-table td { padding: 0.55rem 0.75rem; line-height: 1.3; }
  .format-table td { font-variant-numeric: tabular-nums; }
  .format-table th:first-child, .format-table td:first-child { width: 50%; }
  .format-table th.num, .format-table td.num { text-align: right; }
  .format-table tbody tr:hover td { background: none; color: inherit; }
  .format-table .pos-chip { font-size: 0.82rem; }

  /* The invert table adds a narrow fourth column for the Fast Four bracket, so
     its first three columns still span the shared width. */
  .invert-table { max-width: calc(var(--table-w) + 6rem); }
  .invert-table th:first-child, .invert-table td:first-child { width: 32%; }
  .invert-table th.ff-col, .invert-table td.ff-col, .invert-table td.ff-bracket {
    width: 6rem; padding: 0; border-bottom: 0; background: none;
  }
  /* A left-facing bracket beside the top four: a vertical bar on the table's
     edge with short arms reaching back across the first and last Fast Four rows. */
  .invert-table td.ff-bracket {
    position: relative; vertical-align: middle; text-align: left; white-space: nowrap;
    padding-left: 0.8rem; border-left: 2px solid var(--accent);
    font-family: var(--display); font-size: 0.7rem; line-height: 1.2;
    text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent);
  }
  .invert-table td.ff-bracket::before,
  .invert-table td.ff-bracket::after {
    content: ''; position: absolute; right: 100%; width: 0.45rem; height: 2px; background: var(--accent);
  }
  .invert-table td.ff-bracket::before { top: 0; }
  .invert-table td.ff-bracket::after { bottom: -1px; }
</style>
