// Pure points calculator. Given a season's pointsConfig and one result's facts,
// returns { base, bonus, total }. Reused at ingest and rescore.
export function computePoints(pointsConfig, { kind, finish, lapsLead }) {
  const cfg = pointsConfig?.[kind] ?? { base: {} };
  const base = finish == null ? 0 : cfg.base?.[finish] ?? 0;
  // Races pay a flat bonus for leading at least one lap, however many.
  const bonus = cfg.lapLedBonus && (lapsLead ?? 0) > 0 ? cfg.lapLedBonus : 0;
  return { base, bonus, total: base + bonus };
}
