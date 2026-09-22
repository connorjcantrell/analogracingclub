// A schedule round's card image lives in the same store as race photos, in a
// folder keyed by series + round so it can be cleared with the series.
export const roundImageKey = (slug, round) => `schedule-${slug}-r${round}`;
