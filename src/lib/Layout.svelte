<script>
  // Site chrome shared by every page: brand, page links (behind a hamburger on
  // narrow screens), an optional page-supplied `right` snippet (the admin
  // log-out), the <main> wrapper and the footer with the platform links.
  import { DISCORD_URL, IRACING_URL } from './links.js';
  import { currentTheme, nextFlip, override, apply } from './theme.js';

  let { active = null, mainClass = '', links = 'site', right, children } = $props();

  const SITE = [
    { id: 'results', href: '/results', label: 'Results' },
    { id: 'standings', href: '/standings', label: 'Standings' },
    { id: 'stake', href: '/stake', label: 'Stake' },
    { id: 'videos', href: '/videos', label: 'Videos' },
    { id: 'about', href: '/about', label: 'About' },
  ];
  const ADMIN = [...SITE.filter((l) => ['results', 'standings', 'stake'].includes(l.id)), { id: 'admin', href: '/admin', label: 'Admin' }];
  const items = $derived(links === 'admin' ? ADMIN : links === 'site' ? SITE : []);

  // The phone menu, closed until its button is tapped.
  let open = $state(false);
  let header;
  // The header's height, published as --header-h so in-page anchors can land
  // beneath the sticky bar.
  let headerH = $state(0);
  $effect(() => { document.documentElement.style.setProperty('--header-h', `${headerH}px`); });

  // Light or dark by the clock (see theme.js). app.html has already put the
  // theme on <html> before paint; this keeps it current while the tab stays
  // open, and the switch overrides it until the clock next flips.
  let theme = $state('dark');
  $effect(() => {
    let timer;
    const tick = () => {
      theme = currentTheme();
      apply(theme);
      timer = setTimeout(tick, Math.max(1000, nextFlip() - Date.now() + 500));
    };
    tick();
    return () => clearTimeout(timer);
  });
  function flipTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    override(theme);
    apply(theme);
  }
</script>

<!-- The menu closes on an outside tap or Escape so it never lingers over the
     page. On a phone the open menu is part of the sticky bar, so it folds as soon
     as the page scrolls rather than riding along over the content. -->
<svelte:document
  onclick={(e) => { if (open && !header.contains(e.target)) open = false; }}
  onkeydown={(e) => { if (e.key === 'Escape') open = false; }} />
<svelte:window onscroll={() => { if (open && window.scrollY > 24) open = false; }} />

<header class={{ 'nav-open': open }} bind:this={header} bind:clientHeight={headerH}>
  <a class="brand" href="/" aria-label="Analog Racing Club">
    <img class="brand-logo" src="/assets/analog_sq.png" alt="Analog Racing Club">
  </a>
  {#if items.length}
    <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded={open} aria-controls="siteNav"
      onclick={() => (open = !open)}><span></span><span></span><span></span></button>
    <nav id="siteNav">
      {#each items as l (l.id)}
        <a href={l.href} class={{ active: l.id === active }} onclick={() => (open = false)}>{l.label}</a>
      {/each}
    </nav>
  {/if}
  {#if right}
    {@render right()}
  {/if}
  <button class="theme-toggle" type="button" onclick={flipTheme}
    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
    {#if theme === 'light'}
      <!-- moon -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    {:else}
      <!-- sun -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    {/if}
  </button>
</header>
<main class={mainClass}>
  {@render children?.()}
</main>
<footer>
  <img class="footer-mark" src="/assets/logo.png" alt="Analog Racing Club">
  <span class="footer-links">
    <a href={DISCORD_URL} target="_blank" rel="noopener" aria-label="Join our Discord"><img class="on-dark" src="/assets/Discord-Symbol-White.svg" alt="Discord"><img class="on-light" src="/assets/Discord-Symbol-Black.svg" alt="Discord"></a>
    <a href={IRACING_URL} target="_blank" rel="noopener" aria-label="Join iRacing"><img class="mark-mono" src="/assets/iracing.png" alt="iRacing"></a>
  </span>
</footer>
