<script>
  // A driver's name. When they earned round honours, the name gets a dotted
  // underline and a stylized tooltip listing those achievements on hover.
  import { BADGE_META } from './badges.js';

  let { name, keys = [] } = $props();
  const items = $derived((keys ?? []).map((k) => BADGE_META[k]).filter(Boolean));
</script>

{#if items.length}
  <span class="driver-name has-achv">
    {name}
    <span class="achv-tip" role="tooltip">
      {#each items as it (it.label)}
        <span class="achv-row"><strong>{it.label}</strong>{it.desc}</span>
      {/each}
    </span>
  </span>
{:else}
  {name}
{/if}
