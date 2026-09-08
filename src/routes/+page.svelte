<script>
  import ResultPost from '$lib/ResultPost.svelte';
  import SchedulePost from '$lib/SchedulePost.svelte';
  import { api } from '$lib/api.js';

  let { data } = $props();

  let posts = $state(data.posts);
  let hasMore = $state(data.hasMore);
  let loading = $state(false);

  // Re-seed from the server load on navigation / invalidateAll.
  $effect(() => { posts = data.posts; hasMore = data.hasMore; });

  // Posts page newest-first and stable, so the next offset is simply how many
  // we already hold. Each click fetches the next page (three posts).
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

  <!-- The next three posts come on request, not on scroll. -->
  {#if hasMore}
    <div class="feed-more">
      <button class="btn" type="button" disabled={loading} onclick={loadMore}>{loading ? 'Loading…' : 'Load more'}</button>
    </div>
  {/if}
</div>
