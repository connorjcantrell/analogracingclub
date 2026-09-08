<script>
  import ResultPost from '$lib/ResultPost.svelte';
  import SchedulePost from '$lib/SchedulePost.svelte';
  import { api } from '$lib/api.js';

  let { data } = $props();

  let posts = $state(data.posts);
  let hasMore = $state(data.hasMore);
  let loading = $state(false);
  let sentinel = $state(null);

  // Re-seed from the server load on navigation / invalidateAll.
  $effect(() => { posts = data.posts; hasMore = data.hasMore; });

  // Posts page newest-first and stable, so the next offset is simply how many
  // we already hold.
  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    const res = await api(`/api/feed?offset=${posts.length}&limit=${data.pageSize}`);
    if (Array.isArray(res?.posts)) {
      posts = [...posts, ...res.posts];
      hasMore = !!res.hasMore;
    } else {
      hasMore = false; // stop retrying on an error response
    }
    loading = false;
  }

  // Auto-load as the sentinel nears the viewport. Only mounted while there is
  // more to fetch, so it stops cleanly at the end.
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
</script>

<svelte:head>
  <title>Analog Racing Club</title>
  <meta name="description" content="Analog Racing Club — an iRacing league.">
</svelte:head>

<div class="feed">
  {#if !posts.length}
    <section class="lp-section">
      <p class="sched-round">Feed</p>
      <h2 class="lp-h">Nothing here yet</h2>
      <p class="lp-sub">Posts will show up here as events run and schedules are announced.</p>
    </section>
  {:else}
    {#each posts as post (post.id)}
      <section class="lp-section">
        {#if post.type === 'schedule'}
          <SchedulePost {post} />
        {:else}
          <ResultPost {post} />
        {/if}
      </section>
    {/each}
  {/if}

  {#if hasMore}
    <div class="feed-sentinel" bind:this={sentinel} aria-hidden="true"></div>
    {#if loading}<p class="feed-loading">Loading…</p>{/if}
  {/if}
</div>
