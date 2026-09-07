<script>
  import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · Analog Racing Club</title></svelte:head>
<h2>{page.status}</h2>
<p class="empty">{page.error?.message ?? 'Something went wrong.'}</p>
