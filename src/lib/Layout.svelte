<script>
  // Site chrome shared by every page: brand, page links (behind a hamburger on
  // narrow screens), the platform icons or a page-supplied `right` snippet,
  // the <main> wrapper and the footer.
  import { DISCORD_URL } from './links.js';

  let { active = null, mainClass = '', links = 'site', right, children } = $props();

  const SITE = [
    { id: 'standings', href: '/standings', label: 'Standings' },
    { id: 'results', href: '/results', label: 'Results' },
    { id: 'drivers', href: '/drivers', label: 'Power Rankings' },
    { id: 'about', href: '/about', label: 'About' },
  ];
  const ADMIN = [...SITE.slice(0, 3), { id: 'admin', href: '/admin', label: 'Admin' }];
  const items = $derived(links === 'admin' ? ADMIN : links === 'site' ? SITE : []);

  let open = $state(false);
  let header;
</script>

<!-- The menu closes on an outside tap or Escape so it never lingers over the page. -->
<svelte:document
  onclick={(e) => { if (open && !header.contains(e.target)) open = false; }}
  onkeydown={(e) => { if (e.key === 'Escape') open = false; }} />

<header class={{ 'nav-open': open }} bind:this={header}>
  <a class="brand" href="/" aria-label="Analog Racing Club">
    <img class="brand-logo" src="/assets/logo.png" alt="Analog Racing Club">
  </a>
  {#if items.length}
    <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded={open} aria-controls="siteNav"
      onclick={() => (open = !open)}><span></span><span></span><span></span></button>
    <nav id="siteNav">
      {#each items as l (l.id)}
        <a href={l.href} class={{ active: l.id === active }}>{l.label}</a>
      {/each}
    </nav>
  {/if}
  {#if right}
    {@render right()}
  {:else if links !== 'none'}
    <a class="platform" href={DISCORD_URL} target="_blank" rel="noopener" aria-label="Join our Discord"><img src="/assets/Discord-Symbol-White.svg" alt="Discord"></a>
    <a class="platform" href="https://www.iracing.com/" target="_blank" rel="noopener" aria-label="Powered by iRacing"><img src="/assets/iracing.png" alt="iRacing"></a>
  {/if}
</header>
<main class={mainClass}>
  {@render children?.()}
</main>
<footer>Analog Racing Club · an iRacing league</footer>
