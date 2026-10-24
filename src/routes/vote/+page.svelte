<script>
  import { enhance } from '$app/forms';
  import { flip } from 'svelte/animate';
  import PageTitle from '$lib/PageTitle.svelte';
  import { LEAGUE_TZ } from '$lib/format.js';

  let { data, form } = $props();

  const session = $derived(data.session);

  // Live tally: seeded by the server load, replaced by SSE pushes.
  let live = $state(null);
  const totals = $derived(live?.totals ?? data.totals ?? {});
  // The up/down halves behind each net, and how many drivers sit on each side.
  const ups = $derived(live?.up ?? data.up ?? {});
  const downs = $derived(live?.down ?? data.down ?? {});
  const upBy = $derived(live?.upBy ?? data.upBy ?? {});
  const downBy = $derived(live?.downBy ?? data.downBy ?? {});
  const voters = $derived(live?.voters ?? data.voters ?? 0);

  // The clock drives the countdown and the open/closed flip, so the page
  // declares the winner the second the window ends without a refresh.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const status = $derived.by(() => {
    if (!session) return 'none';
    if (now < Date.parse(session.startsAt)) return 'upcoming';
    if (now >= Date.parse(session.endsAt)) return 'closed';
    return 'open';
  });
  const fmtLeft = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s % 60}s` : `${m}m ${s % 60}s`;
  };
  // Vote times are shown on the league clock (Pacific), with the zone named.
  const fmtAt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: LEAGUE_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  // Live updates while the vote is open.
  $effect(() => {
    if (!session || data.status === 'closed') return;
    const es = new EventSource('/vote/stream');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      live = msg;
      if (msg.status === 'closed') es.close();
    };
    return () => es.close();
  });

  // Ranking follows the *saved* net totals, so rows only re-order when a ballot
  // is saved (mine or another voter's via the stream) — not as the voter clicks.
  // Bar geometry still tracks the optimistic working total.
  const ranked = $derived([...(session?.cars ?? [])].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0)));
  // Every bar shares one axis from zero to the longest bar: the net in yellow
  // plus the grey downvoted share stacked after it. Yellow never runs left of
  // zero: a car voted below zero shows only grey while its printed total
  // carries the minus.
  const axisMax = $derived.by(() => {
    let hi = 1;
    for (const c of session?.cars ?? []) {
      for (const v of [othersOf(c.id), totalOf(c.id), greyStart(c.id) + greyOf(c.id)]) if (v > hi) hi = v;
    }
    return hi;
  });
  const x = (v) => (Math.max(0, v) / axisMax) * 100;
  // Inline style for a bar segment running from score a to score b (clamped at zero).
  const seg = (a, b) => `left:${x(Math.min(a, b))}%;width:${Math.abs(x(b) - x(a))}%`;
  // The leader is the highest net once any vote is in; a tie brightens all of
  // them. An untouched car (0) outranks one that was only voted against.
  const anyVotes = $derived((session?.cars ?? []).some((c) => totalOf(c.id) !== 0));
  const topNet = $derived(Math.max(0, ...(session?.cars ?? []).map((c) => totalOf(c.id))));
  const leading = (id) => anyVotes && totalOf(id) === topNet;
  const winnerNames = $derived.by(() => {
    if (status !== 'closed') return null;
    const cars = session?.cars ?? [];
    if (!cars.some((c) => totals[c.id])) return [];
    const top = Math.max(0, ...cars.map((c) => totals[c.id] ?? 0));
    return ranked.filter((c) => (totals[c.id] ?? 0) === top).map((c) => c.name);
  });
  // Scores print with a true minus; the voter's own stake also carries a plus.
  const fmtNet = (n) => (n < 0 ? `−${-n}` : String(n));
  const fmtMine = (n) => (n > 0 ? `+${n}` : fmtNet(n));

  // The passcode is remembered in localStorage: a returning driver whose
  // cookie lapsed is signed back in automatically. A failed attempt (typed or
  // automatic) forgets it so a dead code can't loop.
  const CODE_KEY = 'arc:vote-code';
  let loginForm = $state(null);
  let codeInput = $state('');
  let autoTried = false;
  $effect(() => {
    if (data.me || !session || autoTried) return;
    const saved = localStorage.getItem(CODE_KEY);
    if (!saved || !loginForm) return;
    autoTried = true;
    codeInput = saved;
    queueMicrotask(() => loginForm?.requestSubmit());
  });
  function enhanceLogin({ formData }) {
    const entered = String(formData.get('code') ?? '');
    return async ({ result, update }) => {
      if (result.type === 'redirect') localStorage.setItem(CODE_KEY, entered);
      else localStorage.removeItem(CODE_KEY);
      await update();
    };
  }

  // The voter's working allocation; re-seeded from the saved ballot after each save.
  let alloc = $state({});
  $effect(() => {
    if (data.me && session) alloc = Object.fromEntries(session.cars.map((c) => [c.id, data.me.allocation[c.id] ?? 0]));
  });
  const budget = $derived(data.me?.budget ?? 0);
  // Every vote costs one, cast for or against.
  const spent = $derived(Object.values(alloc).reduce((a, b) => a + Math.abs(Number(b) || 0), 0));
  const remaining = $derived(budget - spent);
  const editing = $derived(status === 'open' && !!data.me);

  // Each car's bar splits into the voter's own votes and everyone else's. The
  // server totals already fold in the voter's *saved* ballot, so peel that off
  // and add the *working* figure — the bar then moves as they click, before Save.
  const othersOf = (id) => (totals[id] ?? 0) - (data.me?.allocation?.[id] ?? 0);
  const mineOf = (id) => {
    if (!data.me) return 0;
    return editing ? (Number(alloc[id]) || 0) : (data.me.allocation[id] ?? 0);
  };
  const totalOf = (id) => othersOf(id) + mineOf(id);

  // The grey share of a bar is the downvotes, drawn after the yellow net so
  // the whole bar reads as "what it would have had, less what was taken away".
  // While editing, the voter's own downvotes are the red segment instead, so
  // grey is only everyone else's.
  const mySaved = (id) => data.me?.allocation?.[id] ?? 0;
  const othersDown = (id) => (downs[id] ?? 0) - Math.max(0, -mySaved(id));
  const greyOf = (id) => (editing ? othersDown(id) : (downs[id] ?? 0));
  const greyStart = (id) => (editing ? Math.max(0, othersOf(id) + Math.max(0, mineOf(id))) : Math.max(0, totalOf(id)));

  // Tooltip: the popular vote behind the weighted one — how many drivers are
  // for and against the car, with the votes each side spent. While editing,
  // the voter's own side follows their working ballot.
  const sideCount = (saved, id, sign) => {
    let n = saved[id] ?? 0;
    if (editing) n += (Math.sign(mineOf(id)) === sign ? 1 : 0) - (Math.sign(mySaved(id)) === sign ? 1 : 0);
    return n;
  };
  const upVotesOf = (id) => (ups[id] ?? 0) - Math.max(0, mySaved(id)) + (editing ? Math.max(0, mineOf(id)) : Math.max(0, mySaved(id)));
  const downVotesOf = (id) => othersDown(id) + (editing ? Math.max(0, -mineOf(id)) : Math.max(0, -mySaved(id)));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const tipOf = (id) => {
    const f = sideCount(upBy, id, 1), a = sideCount(downBy, id, -1);
    if (!f && !a) return 'No votes yet';
    return `${plural(f, 'driver')} for (+${upVotesOf(id)}) · ${plural(a, 'driver')} against (−${downVotesOf(id)})`;
  };

  // One-tap edits; nothing counts until Save. A step toward zero refunds a
  // vote; a step away from it spends one, so neither direction can exceed the
  // budget. Going past zero flips the car from "for" to "against" (or back).
  const inc = (id) => { const v = Number(alloc[id]) || 0; if (v < 0 || remaining > 0) alloc[id] = v + 1; };
  const dec = (id) => { const v = Number(alloc[id]) || 0; if (v > 0 || remaining > 0) alloc[id] = v - 1; };
  const clearAll = () => { for (const k of Object.keys(alloc)) alloc[k] = 0; };
</script>

<svelte:head>
  <title>Car Vote · Analog Racing Club</title>
  <!-- Hidden page: reachable only by the direct link. -->
  <meta name="robots" content="noindex, nofollow">
</svelte:head>

<div class="vote">
  <div class="vote-head">
    <PageTitle inline>Next Season's Car</PageTitle>
    {#if data.me}
      <div class="who">
        <span class="who-name">{data.me.driverName}</span>
        <form method="post" action="?/logout" onsubmit={() => localStorage.removeItem(CODE_KEY)}><button class="btn sm" type="submit">Log out</button></form>
      </div>
    {:else if session && status !== 'closed'}
      <form class="code-form" method="post" action="?/login" use:enhance={enhanceLogin} bind:this={loginForm}>
        <input type="text" name="code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" required bind:value={codeInput}>
        <button class="btn" type="submit">Sign in</button>
      </form>
    {/if}
  </div>
  {#if session && status !== 'closed'}
    <ul class="rules">
      <li><strong>Eight rounds.</strong> At least half are road courses. Ovals and dirt ovals are allowed as long as that holds.</li>
      <li><strong>The top 8 pick the tracks.</strong> Each of this season's top 8 in the championship chooses one round.</li>
      <li><strong>This vote picks the car.</strong> One vote per 10 {session.seriesName} points, rounded up. Spend <strong>+</strong> on cars you want to race, <strong>−</strong> on ones you don't. Highest net wins.</li>
    </ul>
    {#if data.me}
      <p class="gate-hint">Your <strong>{data.me.points}</strong> points give you <strong>{data.me.budget}</strong> vote{data.me.budget === 1 ? '' : 's'}.</p>
    {:else}
      <p class="gate-hint">Enter your passcode above to vote.{#if form?.login && form?.error} <span class="msg err">{form.error}</span>{/if}</p>
    {/if}
  {/if}

  {#if !session}
    <p class="empty">No vote is running right now.</p>
  {:else}
    <div class="vote-meta">
      <span class="vote-title">{session.title}</span>
      {#if status === 'upcoming'}
        <span class="chip">Opens {fmtAt(session.startsAt)}</span>
      {:else if status === 'open'}
        <span class="chip live">● Live</span>
        <span class="chip">Closes in {fmtLeft(Date.parse(session.endsAt) - now)}</span>
      {:else}
        <span class="chip">Voting closed {fmtAt(session.endsAt)}</span>
      {/if}
      <span class="chip dim">{voters} driver{voters === 1 ? '' : 's'} voted</span>
    </div>

    {#if status === 'closed' && winnerNames}
      <div class="winner">
        {#if winnerNames.length === 0}
          <span class="winner-label">No votes were cast.</span>
        {:else if winnerNames.length === 1}
          <span class="winner-label">Winner</span>
          <span class="winner-name">{winnerNames[0]}</span>
        {:else}
          <span class="winner-label">Tie</span>
          <span class="winner-name">{winnerNames.join(' · ')}</span>
        {/if}
      </div>
    {/if}

    {#if editing}
      <!-- Interactive tally: spend your votes right on the bars. The bright
           yellow is yours; the dim yellow is everyone else's net. Your
           downvote is drawn in red eating back into the others' net; everyone
           else's downvotes are the grey share stacked after it. -->
      <form class="ballot" method="post" action="?/allocate" use:enhance>
        <div class="budget">
          <span class="budget-label">Votes remaining</span>
          <span class="budget-count"><strong>{remaining}</strong></span>
          <div class="budget-actions">
            <button class="btn sm" type="button" disabled={spent === 0} onclick={clearAll}>Clear all</button>
            <button class="btn" type="submit">Save</button>
          </div>
        </div>
        {#if form?.error}<p class="msg err ballot-msg">{form.error}</p>{/if}
        {#if form?.saved}<p class="msg ok ballot-msg">Saved — {form.spent} of {form.budget} votes in. Change it anytime before the vote closes.</p>{/if}

        <div class="board">
          {#each ranked as car (car.id)}
            {@const mine = mineOf(car.id)}
            {@const others = othersOf(car.id)}
            <div class="vrow" animate:flip={{ duration: 400 }}>
              <span class="car">{car.name}</span>
              <div class="track lane" role="img" aria-label={tipOf(car.id)}>
                {#if others !== 0}<div class="seg others" class:down={others < 0} style={seg(0, others)}></div>{/if}
                {#if mine !== 0}<div class="seg mine" class:down={mine < 0} style={seg(others, others + mine)}></div>{/if}
                {#if greyOf(car.id)}<div class="seg cut" style={seg(greyStart(car.id), greyStart(car.id) + greyOf(car.id))}></div>{/if}
                <span class="tip" role="tooltip">{tipOf(car.id)}</span>
              </div>
              <div class="ctl">
                <button class="step down" type="button" aria-label="Vote against {car.name}" title="Vote against" disabled={mine <= 0 && remaining <= 0} onclick={() => dec(car.id)}>−</button>
                <span class="mine-badge" class:down={mine < 0} title="Your votes on {car.name}">{fmtMine(mine)}</span>
                <button class="step" type="button" aria-label="Vote for {car.name}" title="Vote for" disabled={mine >= 0 && remaining <= 0} onclick={() => inc(car.id)}>+</button>
              </div>
              <span class="total" class:down={totalOf(car.id) < 0}>{fmtNet(totalOf(car.id))}</span>
              <input type="hidden" name="car:{car.id}" value={alloc[car.id] ?? 0}>
            </div>
          {/each}
        </div>

      </form>
    {:else}
      <!-- Watch-only tally — net score per car in yellow with the downvoted
           share in grey after it, on the shared axis; the leader(s) brightened. -->
      <div class="board">
        {#each ranked as car (car.id)}
          {@const pts = totalOf(car.id)}
          <div class="vrow watch" class:leader={leading(car.id)} animate:flip={{ duration: 500 }}>
            <span class="car">{car.name}</span>
            <div class="track" role="img" aria-label={tipOf(car.id)}>
              <div class="bar" style={seg(0, pts)}></div>
              {#if greyOf(car.id)}<div class="seg cut" style={seg(greyStart(car.id), greyStart(car.id) + greyOf(car.id))}></div>{/if}
              <span class="tip" role="tooltip">{tipOf(car.id)}</span>
            </div>
            <span class="total" class:down={pts < 0}>{fmtNet(pts)}</span>
          </div>
        {/each}
      </div>

      {#if status === 'upcoming'}
        <p class="empty">Voting opens {fmtAt(session.startsAt)}{#if data.me} — your votes are ready{/if}.</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  /* Same broadcast language as the standings tower: site tokens, slanted
     accents, tabular numerals. */
  .vote { max-width: 60rem; margin: 0 auto; }
  .vote-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .who { display: flex; align-items: center; gap: 0.6rem; }
  .who-name { font-family: var(--display); font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }

  .vote-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin: 1.1rem 0 1.5rem; }
  .vote-title { font-family: var(--display); font-weight: 600; font-style: italic; text-transform: uppercase; letter-spacing: 0.08em; }
  .chip {
    font-family: var(--display); font-size: 0.68rem; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); border: 1px solid var(--accent); padding: 0.12rem 0.55rem; transform: skewX(-11deg);
  }
  .chip.dim { color: var(--muted); border-color: var(--border); }
  .chip.live { background: var(--accent); color: #121212; }

  .winner {
    display: flex; align-items: baseline; gap: 0.8rem; margin: 0 0 1.4rem;
    border: 1px solid var(--accent); background: var(--accent-dim); padding: 0.8rem 1rem;
  }
  .winner-label {
    font-family: var(--display); font-size: 0.7rem; letter-spacing: 0.2em;
    text-transform: uppercase; color: var(--accent);
  }
  .winner-name {
    font-family: var(--display); font-weight: 700; font-style: italic; font-size: 1.4rem;
    text-transform: uppercase; color: var(--text);
  }

  /* ---- Live bars ---- */
  .vote { --down: #e05c5c; }
  .board { border-top: 2px solid var(--accent); padding-top: 1rem; display: grid; gap: 0.55rem; }
  .vrow { align-items: center; }
  .vrow .car { font-family: var(--display); font-weight: 500; font-size: 0.98rem; letter-spacing: 0.02em; }
  .vrow .total {
    text-align: right; font-family: var(--display); font-weight: 700; font-style: italic;
    font-variant-numeric: tabular-nums; color: var(--text);
  }
  /* Bars are positioned on a shared axis (see `seg`), so segments can start
     anywhere right of zero; a negative net draws no yellow. The grey `cut`
     segment is the downvoted share, stacked after the net. */
  .track { position: relative; height: 1.35rem; transform: skewX(-11deg); }
  .bar, .seg { position: absolute; top: 0; height: 100%; }
  .bar { background: var(--accent); opacity: 0.45; transition: width 0.6s ease, left 0.6s ease; }
  .seg.cut { background: rgba(255, 255, 255, 0.13); transition: width 0.6s ease, left 0.6s ease; }
  .total.down { color: var(--down); }

  /* Hover (or tap) a bar for the popular vote: drivers for vs against. The
     same text is the track's accessible name. The track is skewed, so the
     tip skews back to sit square. */
  .tip {
    position: absolute; left: 0; bottom: calc(100% + 0.4rem); z-index: 2; display: none;
    transform: skewX(11deg); white-space: nowrap; pointer-events: none;
    font-family: var(--display); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text); background: #0c0c0c; border: 1px solid var(--border); padding: 0.3rem 0.55rem;
  }
  .track:hover .tip { display: block; }

  /* Watch-only rows: one bar, scaled to the leader; every car tied on top is brightened. */
  .vrow.watch { display: grid; grid-template-columns: minmax(9rem, 14rem) 1fr 3.5rem; gap: 0.75rem; }
  .vrow.watch.leader .bar { opacity: 1; }
  .vrow.watch.leader .total { color: var(--accent); }

  /* ---- Budget header (points remaining) ---- */
  .budget {
    display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap;
    border: 1px solid var(--border); background: #0c0c0c; padding: 0.6rem 1rem; margin-bottom: 1.2rem;
  }
  .budget-label { font-family: var(--display); font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
  .budget-count {
    font-family: var(--display); font-weight: 700; font-style: italic; font-size: 1.5rem;
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .budget-count strong { color: var(--accent); }
  .budget-actions { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; }
  .ballot-msg { margin: -0.6rem 0 1.2rem; }

  /* ---- Interactive rows: your points (bright) + others (dim), controls inline ---- */
  .ballot .vrow {
    display: grid; column-gap: 0.8rem; align-items: center;
    grid-template-columns: minmax(6rem, 11rem) 1fr auto 2.5rem;
    grid-template-areas: "car track ctl total";
    padding: 0.25rem 0; border-bottom: 1px solid var(--border);
  }
  .ballot .vrow .car { grid-area: car; }
  .ballot .vrow .track { grid-area: track; }
  .ballot .vrow .ctl { grid-area: ctl; }
  .ballot .vrow .total { grid-area: total; }
  .vrow input[type="hidden"] { display: none; }
  .track.lane { background: rgba(255, 255, 255, 0.05); }
  .seg { transition: width 0.3s ease, left 0.3s ease; }
  .seg.mine { background: var(--accent); }
  .seg.mine.down { background: var(--down); }
  .seg.others { background: var(--accent); opacity: 0.4; }
  .seg.others.down { background: var(--down); }

  .ctl { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .step {
    width: 1.9rem; height: 1.9rem; display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.15rem; line-height: 1; background: #0c0c0c; color: var(--text);
    border: 1px solid var(--border); cursor: pointer; transform: skewX(-11deg);
  }
  .step:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .step.down:hover:not(:disabled) { border-color: var(--down); color: var(--down); }
  .step:disabled { opacity: 0.35; cursor: default; }
  .mine-badge {
    min-width: 2.2rem; text-align: center; font-family: var(--display); font-weight: 700; font-style: italic;
    font-variant-numeric: tabular-nums; color: var(--accent); font-size: 1.1rem;
  }
  .mine-badge.down { color: var(--down); }
  /* ---- Sign-in ---- */
  .rules { list-style: none; margin: 0.9rem 0 0; padding: 0; max-width: 46rem; color: var(--muted); font-size: 0.9rem; }
  .rules li { margin: 0 0 0.35rem; padding-left: 0.9rem; border-left: 2px solid var(--accent); }
  .rules strong, .gate-hint strong { color: var(--text); }
  .gate-hint { color: var(--muted); font-size: 0.9rem; margin: 0.7rem 0 0; max-width: 46rem; }
  .code-form { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .code-form input {
    width: 9.5rem; text-align: center; letter-spacing: 0.15em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    background: #0c0c0c; color: var(--text); border: 1px solid var(--border); padding: 0.45rem 0.5rem;
  }
  .code-form input:focus { outline: none; border-color: var(--accent); }

  /* ---- Ballot wrapper ---- */
  .ballot { margin: 2rem 0 0; border: 1px solid var(--border); background: var(--panel); padding: 1.1rem 1.2rem; }
  .msg { font-size: 0.9rem; }
  .msg.ok { color: var(--accent); }
  .msg.err { color: #e05c5c; }

  .empty { color: var(--muted); margin-top: 2rem; }

  @media (max-width: 560px) {
    .vrow.watch { grid-template-columns: 1fr auto; }
    .vrow.watch .track { grid-column: 1 / -1; order: 3; }
    /* Controls drop below the bar when there's no room inline. */
    .ballot .vrow {
      grid-template-columns: 1fr auto;
      grid-template-areas: "car total" "track track" "ctl ctl";
      row-gap: 0.4rem;
    }
  }
</style>
