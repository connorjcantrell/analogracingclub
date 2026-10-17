<script>
  import { enhance } from '$app/forms';
  import { flip } from 'svelte/animate';
  import PageTitle from '$lib/PageTitle.svelte';

  let { data, form } = $props();

  const session = $derived(data.session);

  // Live tally: seeded by the server load, replaced by SSE pushes.
  let live = $state(null);
  const totals = $derived(live?.totals ?? data.totals ?? {});
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
  const fmtAt = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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

  // Bars scale to the leader; ranking is live (optimistic while the voter edits).
  const ranked = $derived([...(session?.cars ?? [])].sort((a, b) => totalOf(b.id) - totalOf(a.id)));
  const maxPts = $derived(Math.max(1, ...(session?.cars ?? []).map((c) => totalOf(c.id))));
  const winnerNames = $derived.by(() => {
    if (status !== 'closed') return null;
    const top = Math.max(0, ...(session?.cars ?? []).map((c) => totals[c.id] ?? 0));
    return top ? ranked.filter((c) => (totals[c.id] ?? 0) === top).map((c) => c.name) : [];
  });

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
  const spent = $derived(Object.values(alloc).reduce((a, b) => a + (Number(b) || 0), 0));
  const remaining = $derived(budget - spent);
  const editing = $derived(status === 'open' && !!data.me);

  // Each car's bar splits into the voter's own points and everyone else's. The
  // server totals already fold in the voter's *saved* ballot, so peel that off
  // and add the *working* figure — the bar then grows as they click, before Save.
  const othersOf = (id) => Math.max(0, (totals[id] ?? 0) - (data.me?.allocation?.[id] ?? 0));
  const mineOf = (id) => {
    if (!data.me) return 0;
    return editing ? (Number(alloc[id]) || 0) : (data.me.allocation[id] ?? 0);
  };
  const totalOf = (id) => othersOf(id) + mineOf(id);

  // One-tap edits; nothing counts until Save. Increments can't exceed the budget.
  const inc = (id) => { if (remaining > 0) alloc[id] = (Number(alloc[id]) || 0) + 1; };
  const dec = (id) => { alloc[id] = Math.max(0, (Number(alloc[id]) || 0) - 1); };
  const zeroCar = (id) => (alloc[id] = 0);
  const maxCar = (id) => { if (remaining > 0) alloc[id] = (Number(alloc[id]) || 0) + remaining; };
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
    {/if}
  </div>

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
      <!-- Interactive tally: spend your points right on the bars. The bright
           part of each bar is yours; the dim part is everyone else's. -->
      <form class="ballot" method="post" action="?/allocate" use:enhance>
        <div class="budget">
          <span class="budget-label">Your points</span>
          <span class="budget-count"><strong>{spent}</strong><span class="slash">/</span>{budget}</span>
          <span class="budget-rest">{remaining} left</span>
        </div>

        <div class="board">
          {#each session.cars as car (car.id)}
            {@const mine = mineOf(car.id)}
            <div class="vrow" class:allocated={mine > 0}>
              <span class="car">{car.name}</span>
              <div class="track lane">
                {#if mine > 0}<div class="seg mine" style:width="{(mine / maxPts) * 100}%"></div>{/if}
                {#if othersOf(car.id) > 0}<div class="seg others" style:width="{(othersOf(car.id) / maxPts) * 100}%"></div>{/if}
              </div>
              <span class="total">{totalOf(car.id)}</span>
              <div class="ctl">
                <button class="step" type="button" aria-label="Remove a point from {car.name}" disabled={mine <= 0} onclick={() => dec(car.id)}>−</button>
                <span class="mine-badge" title="Your points on {car.name}">{mine}</span>
                <button class="step" type="button" aria-label="Add a point to {car.name}" disabled={remaining <= 0} onclick={() => inc(car.id)}>+</button>
                <button class="btn xs" type="button" disabled={mine <= 0} onclick={() => zeroCar(car.id)}>Clear</button>
                <button class="btn xs" type="button" title="Apply your {remaining} remaining points here" disabled={remaining <= 0} onclick={() => maxCar(car.id)}>Max</button>
              </div>
              <input type="hidden" name="car:{car.id}" value={alloc[car.id] ?? 0}>
            </div>
          {/each}
        </div>

        <div class="ballot-foot">
          <button class="btn" type="submit">Save</button>
          <button class="btn sm" type="button" disabled={spent === 0} onclick={clearAll}>Clear all</button>
          {#if form?.error}<span class="msg err">{form.error}</span>{/if}
          {#if form?.saved}<span class="msg ok">Saved — {form.spent} of {form.budget} points in. Change it anytime before the vote closes.</span>{/if}
        </div>
      </form>
    {:else}
      <!-- Watch-only tally — bars scale to the current leader. -->
      <div class="board">
        {#each ranked as car, i (car.id)}
          {@const pts = totalOf(car.id)}
          <div class="vrow watch" class:leader={i === 0 && pts > 0} animate:flip={{ duration: 500 }}>
            <span class="car">{car.name}</span>
            <div class="track"><div class="bar" style:width="{(pts / maxPts) * 100}%"></div></div>
            <span class="total">{pts}</span>
          </div>
        {/each}
      </div>

      {#if status === 'open' && !data.me}
        <div class="gate">
          <p>Vote by spending the championship points you earned this season.
          Enter the passcode you were DMed — no code? Ping an admin in Discord.</p>
          <form class="code-form" method="post" action="?/login" use:enhance={enhanceLogin} bind:this={loginForm}>
            <input type="text" name="code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" required bind:value={codeInput}>
            <button class="btn" type="submit">Sign in</button>
            {#if form?.login && form?.error}<span class="msg err">{form.error}</span>{/if}
          </form>
        </div>
      {:else if status === 'upcoming'}
        <p class="empty">Voting opens {fmtAt(session.startsAt)}{#if data.me} — your budget is ready{/if}.</p>
      {/if}
    {/if}
  {/if}
</div>

<style>
  /* Same broadcast language as the standings tower: site tokens, slanted
     accents, tabular numerals. */
  .vote { max-width: 46rem; margin: 0 auto; }
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
  .board { border-top: 2px solid var(--accent); padding-top: 1rem; display: grid; gap: 0.55rem; }
  .vrow { align-items: center; }
  .vrow .car { font-family: var(--display); font-weight: 500; font-size: 0.98rem; letter-spacing: 0.02em; }
  .vrow .total {
    text-align: right; font-family: var(--display); font-weight: 700; font-style: italic;
    font-variant-numeric: tabular-nums; color: var(--text);
  }
  .track { height: 1.35rem; transform: skewX(-11deg); }
  .bar { height: 100%; background: var(--accent); opacity: 0.45; transition: width 0.6s ease; }

  /* Watch-only rows: one bar, scaled to the leader, which is brightened. */
  .vrow.watch { display: grid; grid-template-columns: minmax(9rem, 14rem) 1fr 3.5rem; gap: 0.75rem; }
  .vrow.watch.leader .bar { opacity: 1; }
  .vrow.watch.leader .total { color: var(--accent); }

  /* ---- Budget header (used / available) ---- */
  .budget {
    display: flex; align-items: baseline; gap: 0.7rem; flex-wrap: wrap;
    border: 1px solid var(--accent); background: var(--accent-dim); padding: 0.6rem 1rem; margin-bottom: 1.2rem;
  }
  .budget-label { font-family: var(--display); font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
  .budget-count {
    font-family: var(--display); font-weight: 700; font-style: italic; font-size: 1.5rem;
    font-variant-numeric: tabular-nums; color: var(--muted); line-height: 1;
  }
  .budget-count strong { color: var(--accent); }
  .budget-count .slash { margin: 0 0.1rem; font-style: normal; color: var(--border); }
  .budget-rest { margin-left: auto; font-family: var(--display); font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }

  /* ---- Interactive rows: your points (bright) + others (dim), then controls ---- */
  .ballot .vrow {
    display: grid; column-gap: 0.75rem; row-gap: 0.4rem;
    grid-template-columns: minmax(7rem, 11rem) 1fr 2.5rem;
    grid-template-areas: "car track total" "ctl ctl ctl";
    padding: 0.2rem 0; border-bottom: 1px solid var(--border);
  }
  .ballot .vrow .car { grid-area: car; }
  .ballot .vrow .track { grid-area: track; }
  .ballot .vrow .total { grid-area: total; }
  .ballot .vrow .ctl { grid-area: ctl; }
  .vrow input[type="hidden"] { display: none; }
  .ballot .vrow.allocated .car { color: var(--accent); }

  .track.lane { background: rgba(255, 255, 255, 0.05); display: flex; }
  .seg { height: 100%; transition: width 0.3s ease; }
  .seg.mine { background: var(--accent); }
  .seg.others { background: rgba(255, 255, 255, 0.16); }

  .ctl { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .step {
    width: 1.9rem; height: 1.9rem; display: inline-flex; align-items: center; justify-content: center;
    font-size: 1.15rem; line-height: 1; background: #0c0c0c; color: var(--text);
    border: 1px solid var(--border); cursor: pointer; transform: skewX(-11deg);
  }
  .step:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .step:disabled { opacity: 0.35; cursor: default; }
  .mine-badge {
    min-width: 2.2rem; text-align: center; font-family: var(--display); font-weight: 700; font-style: italic;
    font-variant-numeric: tabular-nums; color: var(--accent); font-size: 1.1rem;
  }
  .btn.xs { font-size: 0.64rem; padding: 0.22rem 0.5rem; }

  /* ---- Sign-in / linking states ---- */
  .gate { margin: 2rem 0 0; border: 1px solid var(--border); background: var(--panel); padding: 1.1rem 1.2rem; }
  .gate p { margin: 0 0 0.9rem; }
  .gate p:last-child { margin-bottom: 0; }
  .code-form { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
  .code-form input {
    width: 9.5rem; text-align: center; letter-spacing: 0.15em; text-transform: uppercase;
    font-variant-numeric: tabular-nums;
    background: #0c0c0c; color: var(--text); border: 1px solid var(--border); padding: 0.45rem 0.5rem;
  }
  .code-form input:focus { outline: none; border-color: var(--accent); }

  /* ---- Ballot wrapper ---- */
  .ballot { margin: 2rem 0 0; border: 1px solid var(--border); background: var(--panel); padding: 1.1rem 1.2rem; }
  .ballot-foot { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-top: 1.1rem; }
  .msg { font-size: 0.9rem; }
  .msg.ok { color: var(--accent); }
  .msg.err { color: #e05c5c; }

  .empty { color: var(--muted); margin-top: 2rem; }

  @media (max-width: 520px) {
    .vrow.watch { grid-template-columns: 1fr auto; }
    .vrow.watch .track { grid-column: 1 / -1; order: 3; }
  }
</style>
