<script>
  // Points across a round: the qualifying and feature positions (the heat is
  // left to its own tab — the grid it sets is implied by the feature result),
  // the places made up from the heat grid to the feature flag, laps led across
  // the round's races, ordered by total, and Points only when the round was
  // scored. On a scored round each position carries the points it earned
  // (+7, +20) and laps led carries the lap-led bonus, so a row adds up. Shared by the
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
  const basePts = (x) => x?.points?.base ?? 0;
  // The lap-led bonus the round paid (session tables show finish points only).
  const lapBonus = (d) => raceSessions(sub.eventType).reduce((n, s) => n + (d[s.kind]?.points?.bonus ?? 0), 0);
  const badges = $derived(roundBadges(sub, { qualifyingPlaces }));
</script>

<table>
  <thead>
    <tr>
      <th class="pos">Pos</th>
      <th>Driver</th>
      {#each kinds as k (k)}<th class="num">{sessionLabel(sub.eventType, k)}</th>{/each}
      {#if gained}<th class="num" title="Places made up from the heat grid to the feature finish">Gained</th>{/if}
      <th class="num" title="Laps led across the round's races">Laps led</th>
      {#if scored}<th class="num">{mult > 1 ? 'Points 2×' : 'Points'}</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each rows as d, i (d.custId)}
      {@const led = lapsLed(d)}
      {@const bonus = lapBonus(d)}
      <tr>
        <td class="pos"><span class="pos-box">{i + 1}</span></td>
        <td><DriverName name={driverName(d.name)} keys={badges.get(d.custId)} /></td>
        {#each kinds as k (k)}
          <td class="num">{posCell(d[k])}{#if scored && basePts(d[k])}<span class="pts-tag" title={`${sessionLabel(sub.eventType, k)}: +${basePts(d[k])} points`}>+{basePts(d[k])}</span>{/if}</td>
        {/each}
        {#if gained}{@const g = roundPositionsGained(d)}<td class={['num', { muted: g == null }]}>{signed(g)}</td>{/if}
        <td class={['num', { muted: !led }]}>{led || '—'}{#if bonus}<span class="pts-tag" title={`Led a lap: +${bonus} point${bonus === 1 ? '' : 's'}`}>+{bonus}</span>{/if}</td>
        {#if scored}<td class="num total">{d.total * mult}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
