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
  // For each Fast Four place, the feature finish whose points, added to the banked
  // qualifying points, match the 21-point winner. Finishing 1st also carries the
  // lap-led bonus, so a line that lands on a win beats the benchmark outright (22).
  const fastFourLine = QUAL_PTS.map((_, i) => {
    const q = i + 1;
    const tie = FEATURE_PTS.findIndex((pts) => qualPts(q) + pts === BENCHMARK) + 1;
    const wins = tie === 1;
    const total = qualPts(q) + featurePts(tie) + (wins ? LED_BONUS : 0);
    return { q, pts: qualPts(q), tie, wins, total };
  });

  // ---- The explainer, presented as a deck of slides ----
  const SLIDES = 5;
  let slide = $state(0);
  let deckEl;
  let isFull = $state(false);
  const go = (n) => { slide = ((n % SLIDES) + SLIDES) % SLIDES; };
  const onDeckKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(slide + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(slide - 1); e.preventDefault(); }
  };
  // Present = the deck fills the screen; the 16:9 surface scales its type with it.
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else deckEl?.requestFullscreen?.();
  };
  const onFsChange = () => {
    isFull = document.fullscreenElement === deckEl;
    if (isFull) deckEl?.focus(); // so arrow keys drive the deck without a click
  };
</script>

<svelte:head><title>Fast Four Format · Analog Racing Club</title></svelte:head>
<svelte:document onfullscreenchange={onFsChange} />

<h2>Fast Four Format</h2>

<!-- The format explained as a deck; arrow keys or the controls step through. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="format-deck" class:full={isFull} bind:this={deckEl} role="group" aria-roledescription="carousel" aria-label="Fast Four format explainer" tabindex="0" onkeydown={onDeckKey}>
  <button class="deck-present" type="button" onclick={toggleFull} aria-label={isFull ? 'Exit full screen' : 'Present full screen'}>{isFull ? 'Exit' : 'Present'}</button>

  <div class="deck-stage">
    <div class="slide-surface">
      {#if slide === 0}
        <article class="format-slide">
          <h3 class="slide-title">Fast Four</h3>
          <p>Every round is three sessions. Most points across the night wins.</p>
          <div class="scroll-x">
            <table class="format-table sessions-table">
              <thead><tr><th>Session</th><th>Length</th></tr></thead>
              <tbody>
                <tr><td class="lead">Open Qualifying</td><td>10 min</td></tr>
                <tr><td class="lead">Heat</td><td>10 min</td></tr>
                <tr><td class="lead">Feature</td><td>30 min</td></tr>
              </tbody>
            </table>
          </div>
        </article>
      {:else if slide === 1}
        <article class="format-slide">
          <h3 class="slide-title">Open Qualifying</h3>
          <p>The top eight qualifiers are reversed for the heat &mdash; pole starts 8th. The
          <strong>Fast Four</strong> earn a point for every place the invert costs them.</p>
          <div class="scroll-x">
            <table class="format-table invert-table">
              <thead><tr><th class="ff-col" aria-hidden="true"></th><th>Qualified</th><th>Heat start</th><th class="num">Points</th></tr></thead>
              <tbody>
                {#each Array.from({ length: INVERTED }, (_, i) => i + 1) as q (q)}
                  <tr>
                    {#if q === 1}
                      <td class="ff-bracket" rowspan={QUAL_PTS.length}><span>Fast Four</span></td>
                    {:else if q > QUAL_PTS.length}
                      <td class="ff-col"></td>
                    {/if}
                    <td><span class="pos-chip" class:start={q <= QUAL_PTS.length}>{ordinal(q)}</span></td>
                    <td>{ordinal(heatStart(q))}</td>
                    <td class="num">{qualPts(q) || '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </article>
      {:else if slide === 2}
        <article class="format-slide">
          <h3 class="slide-title">Heat</h3>
          <p>Where you finish the heat is where you start the feature.</p>
          <p>Lead a lap of the heat or feature for <strong>+1 bonus point</strong>, once per round.</p>
        </article>
      {:else if slide === 3}
        <article class="format-slide">
          <h3 class="slide-title">Feature</h3>
          <p>These points decide the round. Every place inside the top four is worth two; from 5th back, one.</p>
          <div class="slide-cols">
            <div class="scroll-x">
              <table class="format-table">
                <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
                <tbody>
                  {#each FEATURE_PTS.slice(0, 8) as pts, i (i)}
                    <tr><td>{ordinal(i + 1)}</td><td class="num">{pts}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <div class="scroll-x">
              <table class="format-table">
                <thead><tr><th>Finish</th><th class="num">Points</th></tr></thead>
                <tbody>
                  {#each FEATURE_PTS.slice(8) as pts, i (i)}
                    <tr><td>{ordinal(i + 9)}</td><td class="num">{pts}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      {:else}
        <article class="format-slide">
          <h3 class="slide-title">Where the Line Is</h3>
          <p>A feature win from outside the Fast Four scores <strong>{BENCHMARK}</strong> &mdash; 20 plus
          a lap led. Banked points let a Fast Four driver match it without winning:</p>
          <div class="scroll-x">
            <table class="format-table line-table">
              <thead><tr><th>Driver</th><th>Feature finish</th><th>Round total</th></tr></thead>
              <tbody>
                <tr class="winner-row">
                  <td>Feature winner</td>
                  <td>{ordinal(1)}</td>
                  <td>{featurePts(1)} + {LED_BONUS} led = {BENCHMARK}</td>
                </tr>
                {#each fastFourLine as r (r.q)}
                  <tr>
                    <td><span class="pos-chip start">{ordinal(r.q)}</span> qualifier</td>
                    <td>{ordinal(r.tie)}{r.wins ? ' (wins)' : ''}</td>
                    <td>{#if r.wins}{r.pts} + {featurePts(1)} + {LED_BONUS} led = {r.total}{:else}{r.pts} + {BENCHMARK - r.pts} = {BENCHMARK}{/if}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </article>
      {/if}
    </div>
  </div>

  <div class="deck-controls">
    <button class="deck-arrow" type="button" aria-label="Previous slide" onclick={() => go(slide - 1)}>‹</button>
    <div class="deck-dots">
      {#each { length: SLIDES } as _, i}
        <button type="button" class={{ active: i === slide }} aria-label={`Go to slide ${i + 1}`} aria-current={i === slide} onclick={() => go(i)}></button>
      {/each}
    </div>
    <button class="deck-arrow" type="button" aria-label="Next slide" onclick={() => go(slide + 1)}>›</button>
  </div>
</div>

<style>
  /* A stepped-through slide deck. The slide is a 16:9 surface whose type is sized
     in container-query units, so the proportions hold whether it's embedded in the
     page or filling the screen in Present mode — only the surface's size changes. */
  .format-deck {
    position: relative;
    border: 1px solid var(--border); background: rgba(255, 255, 255, 0.015);
    margin: 1.4rem 0 0; display: flex; flex-direction: column;
  }
  .format-deck:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .deck-stage {
    flex: 1 1 auto; min-height: 0;
    display: flex; align-items: center; justify-content: center; padding: 1rem;
  }

  /* The slide itself — a 16:9 canvas. cqmin (its shorter side) drives every size
     inside it via em, so text, tables and spacing scale together with the slide. */
  .slide-surface {
    container-type: size;
    width: 100%; aspect-ratio: 16 / 9;
    /* No lower bound: the type is sized purely from the slide's own dimensions, so
       the layout is scale-invariant — it fits the 16:9 frame at any size (only the
       upper bound keeps it sane on very large screens) and never clips. */
    font-size: min(3.3cqmin, 42px);
    line-height: 1.4;
    display: flex; flex-direction: column; justify-content: center;
    overflow: hidden; padding: 1.1em 1.7em;
  }
  .format-slide { width: 100%; max-width: 44em; margin: 0 auto; }
  .format-slide p { margin: 0 0 0.7em; line-height: 1.4; font-size: 1em; }
  .format-slide p strong { color: var(--accent); font-weight: 500; }

  .slide-title {
    color: var(--text); font-size: 1.85em; font-style: italic; font-weight: 700;
    font-family: var(--display); text-transform: uppercase; letter-spacing: 0.02em;
    line-height: 1.05; margin: 0 0 0.7em;
  }

  .scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  /* Side-by-side table columns so a tall list never outgrows the 16:9 frame. */
  .slide-cols { display: flex; flex-wrap: wrap; gap: 0.4em 1.6em; margin: 0.4em 0; align-items: flex-start; }
  .slide-cols .scroll-x { flex: 1 1 13em; }

  /* Tables inherit the slide's em scale (global rules use rem/px, so override). */
  .slide-surface :global(table) { font-size: 0.8em; }
  .slide-surface :global(.format-table),
  .slide-surface :global(.invert-table) { max-width: none; }
  .slide-surface :global(th) { font-size: 0.7em; padding: 0.28em 0.55em; letter-spacing: 0.12em; line-height: 1.25; }
  .slide-surface :global(td) { padding: 0.28em 0.55em; line-height: 1.25; }
  .slide-surface :global(.pos-chip) { font-size: 0.86em; padding: 0.06em 0.5em; }
  .sessions-table td.lead { font-family: var(--display); letter-spacing: 0.02em; white-space: nowrap; }
  .line-table th, .line-table td { white-space: nowrap; }
  /* The 21-point winner is the benchmark; set it off from the four qualifiers. */
  .line-table :global(tr.winner-row td) { color: var(--muted); border-bottom: 0.16em solid var(--accent); }

  /* "Fast Four" bracket: a rowspan cell beside the top four qualifiers, drawn as a
     right-facing bracket (vertical bar + top/bottom arms) hugging those rows. */
  .slide-surface :global(td.ff-bracket) {
    position: relative; vertical-align: middle; text-align: right; white-space: nowrap;
    padding: 0 0.7em 0 0; background: none; border-bottom: 0;
    border-right: 0.16em solid var(--accent);
    font-family: var(--display); font-size: 0.7em; line-height: 1.2;
    text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent);
  }
  .slide-surface :global(td.ff-bracket)::before,
  .slide-surface :global(td.ff-bracket)::after {
    content: ''; position: absolute; left: 100%; width: 0.45em; height: 0.16em; background: var(--accent);
  }
  .slide-surface :global(td.ff-bracket)::before { top: 0; }
  .slide-surface :global(td.ff-bracket)::after { bottom: 0; }
  .slide-surface :global(.ff-col) { padding: 0; border-bottom: 0; background: none; }

  /* ---- Present (full screen) ---- */
  .deck-present {
    position: absolute; top: 0.55rem; right: 0.55rem; z-index: 3;
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    font-family: var(--display); font-size: 0.68rem; letter-spacing: 0.14em;
    text-transform: uppercase; padding: 0.32rem 0.8rem; cursor: pointer;
  }
  .deck-present:hover { border-color: var(--accent); color: var(--accent); }

  .format-deck:fullscreen { margin: 0; border: 0; background: var(--bg); }
  .format-deck:fullscreen .deck-stage { padding: 2.5vh 2.5vw 1vh; }
  /* Full screen: size the 16:9 surface by height so it letterboxes on any screen. */
  .format-deck:fullscreen .slide-surface {
    width: auto; height: 100%; max-width: 100%; aspect-ratio: 16 / 9;
  }
  .format-deck:fullscreen .deck-controls { border-top-color: var(--border); }

  /* ---- Deck controls ---- */
  .deck-controls {
    flex: none; display: flex; align-items: center; justify-content: center; gap: 1rem;
    padding: 0.9rem 1rem; border-top: 1px solid var(--border);
  }
  .deck-arrow {
    background: var(--panel); border: 1px solid var(--border); color: var(--text);
    font-size: 1.2rem; line-height: 1; padding: 0.25rem 0.7rem; cursor: pointer;
    transform: skewX(-11deg);
  }
  .deck-arrow:hover { border-color: var(--accent); color: var(--accent); }
  .deck-dots { display: flex; gap: 0.5rem; }
  .deck-dots button {
    width: 0.7rem; height: 0.7rem; padding: 0; cursor: pointer;
    background: transparent; border: 1px solid var(--muted); transform: skewX(-11deg);
  }
  .deck-dots button:hover { border-color: var(--accent); }
  .deck-dots button.active { background: var(--accent); border-color: var(--accent); }
</style>
