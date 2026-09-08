// The title for a results post. There is no body copy — the title carries the
// story, and the table below it does the rest.
//
// A league (Fast Four) round is titled by its round winner and, when someone
// else won the feature, that driver too; the track is named without its
// config/"version" suffix. A one-off Special event is "<name> wins <event>".
//
// Pure and DB-free, so it is unit-testable.
import { trackName, winner as winnerOf, overallWinner, raceSessions, session, driverName } from '../format.js';

const eventName = (sub) => sub.title || trackName(sub) || 'the latest round';

// The driver who led the most laps in a session (null if nobody led any).
function mostLapsLed(sub, kind) {
  let best = null;
  for (const r of session(sub, kind)?.results ?? []) {
    const laps = r.lapsLead ?? 0;
    if (laps > 0 && (!best || laps > best.laps)) best = { name: driverName(r.displayName), laps };
  }
  return best?.name ?? null;
}

export function resultPostTitle(series, sub) {
  const races = raceSessions(sub.eventType);

  // A league round (a series that runs more than one race).
  if (series && races.length > 1) {
    const round = overallWinner(sub);
    const featureKind = races[races.length - 1].kind;
    const feature = winnerOf(sub, featureKind);
    const track = sub.track?.name || 'the latest round';
    if (!round) return `Results — ${track}`;
    // A clean sweep: the same driver takes the round, wins the feature, and
    // leads the most laps in it.
    if (feature === round && mostLapsLed(sub, featureKind) === round) {
      return `${round} dominates at ${track}`;
    }
    return feature && feature !== round
      ? `${round} wins round with ${feature} taking the feature win at ${track}`
      : `${round} wins round at ${track}`;
  }

  // A one-off: named by its final-race winner and its own title.
  const name = winnerOf(sub, races[races.length - 1]?.kind);
  const event = eventName(sub);
  return name ? `${name} wins ${event}` : `Results — ${event}`;
}
