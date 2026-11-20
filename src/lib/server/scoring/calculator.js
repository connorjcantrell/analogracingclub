// Pure points calculator. Given a season's pointsConfig and one result's facts,
// returns { base, bonus, total }. Reused at ingest and rescore.
//
// A session kind pays either a fixed table (`base`, points by finishing
// position) or, with `scale: 'field'`, by the size of the field: last place
// scores 1 and every position up pays one more, so the win is worth as many
// points as there were classified finishers. `field` is that count.
export function computePoints(pointsConfig, { kind, finish, lapsLead, field = 0 }) {
  const cfg = pointsConfig?.[kind] ?? { base: {} };
  const base = finish == null ? 0
    : cfg.scale === 'field' ? Math.max(0, (field ?? 0) - finish + 1)
    : cfg.base?.[finish] ?? 0;
  // Races pay a flat bonus for leading at least one lap, however many.
  const bonus = cfg.lapLedBonus && (lapsLead ?? 0) > 0 ? cfg.lapLedBonus : 0;
  return { base, bonus, total: base + bonus };
}
