<script>
  // Dispatches a results post to the component for its event type. Each type
  // owns its own post — layout, table schema, and copy — so they can diverge
  // freely. Add a branch + component when a new event type is introduced.
  import FastFourPost from './FastFourPost.svelte';
  import SpecialEventPost from './SpecialEventPost.svelte';

  let { post } = $props();
  const eventType = $derived(post.subsession?.eventType?.id);
</script>

{#if eventType === 'league-fast-four'}
  <FastFourPost {post} />
{:else}
  <SpecialEventPost {post} />
{/if}
