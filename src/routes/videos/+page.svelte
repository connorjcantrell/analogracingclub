<script>
  import PageTitle from '$lib/PageTitle.svelte';
  import VideoStrip from '$lib/VideoStrip.svelte';
  import { DISCORD_URL } from '$lib/links.js';

  let { data } = $props();
</script>

<svelte:head><title>Videos · Analog Racing Club</title></svelte:head>

<div class="videos-page">
  <PageTitle>Videos</PageTitle>
  <p class="lp-sub">Race broadcasts, onboards and recaps from the league's YouTube channels, newest first.</p>

  {#if !data.videos.length}
    <p class="empty">No videos yet — they appear here as the followed channels upload them.</p>
  {:else}
    <VideoStrip videos={data.videos} feed />
  {/if}

  <p class="videos-note">Do you stream or upload league races? Reach out to a league admin on
    <a class="link" href={DISCORD_URL} target="_blank" rel="noopener">Discord</a> to have your channel added. Any video of yours
    that mentions "Analog Racing Club" or links analogracingclub.com in its title or description will show up here and under the race it covers.</p>
</div>
