<script>
  import '../app.css';
  import { page } from '$app/state';
  import Layout from '$lib/Layout.svelte';

  let { children } = $props();
  const path = $derived(page.url.pathname);
  const isAdmin = $derived(path === '/admin' || path.startsWith('/admin/'));
  const isLogin = $derived(path.startsWith('/admin/login'));
  const active = $derived(isAdmin ? 'admin' : path === '/' ? null : path.split('/')[1]);
  const links = $derived(isLogin ? 'none' : isAdmin ? 'admin' : 'site');
  const mainClass = $derived(path === '/' ? 'home' : path === '/about' ? 'prose' : '');
</script>

{#snippet logout()}
  <form class="platform" method="post" action="/admin/logout" style="line-height:1"><button class="btn sm" type="submit">Log out</button></form>
{/snippet}

<Layout {active} {links} {mainClass} right={links === 'admin' ? logout : undefined}>
  {@render children()}
</Layout>
