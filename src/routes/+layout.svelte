<script>
  import '../app.css';
  import { page } from '$app/state';
  import Layout from '$lib/Layout.svelte';

  let { data, children } = $props();
  const path = $derived(page.url.pathname);
  const isAdmin = $derived(path === '/admin' || path.startsWith('/admin/'));
  const isLogin = $derived(path.startsWith('/admin/login'));
  const active = $derived(isAdmin ? 'admin' : path === '/' ? null : path.split('/')[1]);
  const links = $derived(isLogin ? 'none' : isAdmin ? 'admin' : 'site');
  const mainClass = $derived(path === '/' ? 'home' : path === '/about' ? 'prose' : '');
</script>

<svelte:head>
  <!-- Link previews (Discord, iMessage, Slack…) read these; pages set their own <title>. -->
  <meta name="description" content={data.og.description}>
  <meta property="og:site_name" content={data.og.siteName}>
  <meta property="og:type" content="website">
  <meta property="og:url" content={data.og.url}>
  <meta property="og:description" content={data.og.description}>
  <meta property="og:image" content={data.og.image}>
  <meta property="og:image:width" content={data.og.width}>
  <meta property="og:image:height" content={data.og.height}>
  <meta property="og:image:alt" content={data.og.imageAlt}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content={data.og.image}>
</svelte:head>

{#snippet logout()}
  <form class="platform" method="post" action="/admin/logout" style="line-height:1"><button class="btn sm" type="submit">Log out</button></form>
{/snippet}

<Layout {active} {links} {mainClass} right={links === 'admin' ? logout : undefined}>
  {@render children()}
</Layout>
