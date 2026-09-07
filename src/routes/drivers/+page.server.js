import { computePowerRanking, computeRivals } from '$lib/server/power/index.js';

// The ranking is built head-to-head: each driver's record against everyone
// they raced, blended into a transitive order over the same metrics. Rival
// data (opponents + the featured rivalry) is method-independent.
export async function load({ locals }) {
  const [power, rivals] = await Promise.all([computePowerRanking(locals.db, {}), computeRivals(locals.db, {})]);
  return { power, rivals };
}
