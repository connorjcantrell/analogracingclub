<script>
  // One session, ordered by finishing position, with the columns that matter
  // for it and the points it awarded. Columns with nothing in them are dropped:
  // an unscored special event has no points, and a standing-start-only event
  // has no grid positions.
  import { driverName, session, SESSION_COLS } from './format.js';

  let { sub, kind, mult = 1, limit = Infinity } = $props();
  const all = $derived((session(sub, kind)?.results ?? []).slice()
    .sort((a, b) => (a.finish ?? Infinity) - (b.finish ?? Infinity)));
  const rows = $derived(all.slice(0, limit));
  const cols = $derived((SESSION_COLS[kind] ?? []).filter((c) => all.some((x) => c.cell(x, all) != null)));
  const scored = $derived(all.some((x) => (x.points?.total ?? 0) !== 0));
</script>

{#if !all.length}
  <p class="empty">No results for this session.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th class="pos">Pos</th>
        <th>Driver</th>
        {#each cols as c (c.head)}<th class="num">{c.head}</th>{/each}
        {#if scored}<th class="num">{mult > 1 ? 'Points 2×' : 'Points'}</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as x (x.custId)}
        <tr>
          <td class="pos"><span class="pos-box">{x.finish == null ? '—' : x.finish}</span></td>
          <td>{driverName(x.displayName)}</td>
          {#each cols as c (c.head)}
            {@const v = c.cell(x, all)}
            <td class={['num', { muted: v == null }]}>{v ?? '—'}</td>
          {/each}
          {#if scored}<td class="num total">{(x.points?.total ?? 0) * mult}</td>{/if}
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
