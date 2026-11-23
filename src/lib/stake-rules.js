// The stake multiplier's constants, in one place: the math (src/lib/server/stake)
// and the Stake page's explanation both read them, so the copy can never
// disagree with the calculation.

/**
 * Races a driver must have run, in any season, before they hold stake: until
 * then their stake is 0 (their points wait, and count from the race that
 * qualifies them) and their multiplier is fixed at 1.
 */
export const MIN_RACES = 3;
/** The rolling window: incidents per corner is measured over a driver's last this-many races. */
export const WINDOW_RACES = 5;
/** The multiplier's floor and ceiling. */
export const MULT_MIN = 0.5;
export const MULT_MAX = 1.5;

/**
 * The corners a lap counts for in the rate. iRacing reports each layout's
 * corners per lap; an oval's four count as two, since its corners come in
 * pairs that a driver takes as one. Null when the event has no count (an
 * event filed before corners were kept), in which case its laps do not
 * count toward the rate at all.
 */
export const OVAL_CORNER_SHARE = 0.5;
export const isOval = (category) => /oval/i.test(category ?? '');
export const countedCorners = (track) => {
  const n = track?.corners;
  if (typeof n !== 'number' || !(n > 0)) return null;
  return isOval(track.category) ? n * OVAL_CORNER_SHARE : n;
};

/**
 * How deep a clean driver's green goes: 0 at 1.0x (or anything below), rising
 * in a straight line to 1 at MULT_MAX. The page scales it to its own cap.
 */
export const cleanLevel = (multiplier) => Math.min(1, Math.max(0, (multiplier - 1) / (MULT_MAX - 1)));

/**
 * The hot hand: the most points per championship round, among drivers who
 * have raced at least this many rounds (the multiplier's minimum, so a
 * single win does not take it).
 */
export const MIN_ROUNDS = MIN_RACES;

/** A multiplier for display: 1.2 reads 1.20x. */
export const multText = (multiplier) => `${multiplier.toFixed(2)}x`;
