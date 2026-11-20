<script module>
  // Whether the picker renders for a page's `pick` data: only with more than
  // one series. Pages use this to avoid naming the series twice.
  export const hasChoices = (pick) => (pick?.containers?.length ?? 0) > 1;
</script>

<script>
  // Series picker for the standings page. The page's load decides the choices
  // and the current pick (?series= wins, else the first active series);
  // changing it re-runs that load via the URL. Options carry the series name
  // only; its format shows as chips on the line beneath.
  import { goto } from '$app/navigation';

  let { containers = [], value = null } = $props();

  function change(e) {
    goto(`?series=${encodeURIComponent(e.currentTarget.value)}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

{#if hasChoices({ containers })}
  <select class="series-pick" {value} onchange={change}>
    {#each containers as s (s.slug)}
      <option value={s.slug}>{s.name}{s.status !== 'active' ? ` (${s.status})` : ''}</option>
    {/each}
  </select>
{/if}
