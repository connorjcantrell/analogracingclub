<script>
  // Points across a round: the qualifying and feature positions (the heat is
  // left to its own tab — the grid it sets is implied by the feature result),
  // the places made up from the heat grid to the feature flag, laps led across
  // the round's races, ordered by total, and Points only when the round was
  // scored. The lap-led bonus is folded into Points; the Laps led header
  // explains it on hover. Shared by the
  // results page; the homepage feed's per-type posts render their own tables
  // (see FastFourPost / SpecialEventPost).
  import { driverName, sessionKindsOf, sessionLabel, roundTable, posCell, roundPositionsGained, signed, raceSessions } from './format.js';
  import { roundBadges } from './badges.js';
  import DriverName from './DriverName.svelte';

  let { sub, mult = 1, limit = Infinity, qualifyingPlaces = 0 } = $props();
  const kinds = $derived(sessionKindsOf(sub.eventType).filter((k) => k !== 'sprint'));
  const rows = $derived(roundTable(sub).slice(0, limit));
  const scored = $derived(roundTable(sub).some((d) => d.total !== 0));
  // Positions gained only when some grid slot was recorded (a standing-start
  // special with no grid has nothing to gain from).
  const gained = $derived(rows.some((d) => roundPositionsGained(d) != null));
  const lapsLed = (d) => raceSessions(sub.eventType).reduce((n, s) => n + (d[s.kind]?.lapsLead ?? 0), 0);
  // The lap-led bonus the round paid (session tables show finish points only),
  // named in the Laps led header's tooltip when the format pays one.
  const lapBonus = (d) => raceSessions(sub.eventType).reduce((n, s) => n + (d[s.kind]?.points?.bonus ?? 0), 0);
  const bonusPaid = $derived(Math.max(0, ...rows.map(lapBonus)));
  const lapsLedTip = $derived(bonusPaid
    ? `Laps led across the round's races. Leading at least one lap earns a ${bonusPaid}-point bonus, paid once per round and included in Points.`
    : "Laps led across the round's races");
  const badges = $derived(roundBadges(sub, { qualifyingPlaces }));
</script>

<table>
  <thead>
    <tr>
      <th class="pos">Pos</th>
      <th>Driver</th>
      {#each kinds as k (k)}<th class="num">{sessionLabel(sub.eventType, k)}</th>{/each}
      {#if gained}<th class="num" title="Places made up from the heat grid to the feature finish">Positions gained</th>{/if}
      <th class="num" title={lapsLedTip}>Laps led</th>
      {#if scored}<th class="num">{mult > 1 ? 'Points 2×' : 'Points'}</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each rows as d, i (d.custId)}
      {@const led = lapsLed(d)}
      <tr>
        <td class="pos"><span class="pos-box">{i + 1}</span></td>
        <td><DriverName name={driverName(d.name)} keys={badges.get(d.custId)} /></td>
        {#each kinds as k (k)}<td class="num">{posCell(d[k])}</td>{/each}
        {#if gained}{@const g = roundPositionsGained(d)}<td class={['num', { muted: g == null }]}>{signed(g)}</td>{/if}
        <td class={['num', { muted: !led }]}>{led || '—'}</td>
        {#if scored}<td class="num total">{d.total * mult}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
