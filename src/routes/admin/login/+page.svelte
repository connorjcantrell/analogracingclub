<script>
  let { form } = $props();
  const error = $derived(form?.error === 'locked' ? 'Too many attempts — try again in 15 minutes.' : form?.error ? 'Wrong password.' : null);
</script>

<svelte:head>
  <title>Admin login · Analog Racing Club</title>
  <meta name="robots" content="noindex">
</svelte:head>

<form class="login" method="post">
  <h2>Admin login</h2>
  {#if error}<p class="err">{error}</p>{/if}
  <label for="password">Password</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Log in</button>
</form>

<style>
  .login { max-width: 380px; margin: 4rem auto; padding: 2rem; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
  .login h2 { font-size: 1.4rem; margin-bottom: 1.2rem; }
  .login label { display: block; color: var(--muted); font-size: 0.85rem; margin-bottom: 0.4rem; }
  .login input { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.7rem; font: inherit; margin-bottom: 1rem; }
  .login button { width: 100%; background: var(--accent); color: var(--on-accent); border: 0; border-radius: 8px; padding: 0.65rem; font: inherit; font-weight: 600; cursor: pointer; }
  .login .err { color: var(--red); font-size: 0.9rem; margin: 0 0 1rem; }
</style>
