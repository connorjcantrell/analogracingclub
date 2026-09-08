<script>
  // Series picker for the standings/results pages. The page's load decides the
  // choices and the current pick (?series= wins, else the first active series);
  // changing it re-runs that load via the URL. Renders a <select> only when
  // there is more than one choice.
  import { goto } from '$app/navigation';
  import { SPECIAL_SLUG } from './format.js';

  let { containers = [], hasSpecial = false, value = null } = $props();
  const choices = $derived(containers.length + (hasSpecial ? 1 : 0));

  function change(e) {
    goto(`?series=${encodeURIComponent(e.currentTarget.value)}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

{#if choices > 1}
  <select class="series-pick" {value} onchange={change}>
    {#each containers as s (s.slug)}
      <option value={s.slug}>{s.name} · {s.typeLabel}{s.status !== 'active' ? ` (${s.status})` : ''}</option>
    {/each}
    {#if hasSpecial}<option value={SPECIAL_SLUG}>Special events</option>{/if}
  </select>
{/if}
