import { fail } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { getVoter } from '$lib/server/vote/auth.js';
import { loginAction, logoutAction } from '$lib/server/vote/login.js';
import {
  WEATHER, VARIATIONS, NOTES_MAX, getCurrentSelection, selectionView, savePick, getVoteBallot, saveStake, stakeFor,
} from '$lib/server/track-selection/index.js';

// Next season's track selection: the drivers the admin named each choose one
// round, and any round left by a driver who opted out goes to a community
// vote that every driver with a passcode can join. Anyone can see the board;
// saving a pick or a ballot takes the driver's passcode. Eligibility is
// re-checked in the actions, so the page state is a convenience, not the gate.
export async function load(event) {
  const db = event.locals.db;
  const voter = getVoter(event);
  const selection = await getCurrentSelection(db);
  if (!selection) return { selection: null, me: null };
  const view = await selectionView(db, selection);

  let me = null;
  if (voter) {
    const picker = view.pickers.find((p) => p.custId === voter.custId);
    const [driver, stake, ballot] = await Promise.all([
      picker ? null : collections(db).drivers.findOne({ _id: voter.custId }),
      selection.vote ? stakeFor(db, selection.vote, voter.custId) : null,
      selection.vote ? getVoteBallot(db, selection._id, voter.custId) : null,
    ]);
    me = {
      custId: voter.custId,
      driverName: picker?.displayName ?? driver?.displayName ?? `#${voter.custId}`,
      picker: !!picker,
      pick: picker?.pick ?? null,
      // The community vote: this driver's stake and saved ballot, if one is running.
      points: stake?.points ?? 0,
      stake: stake?.stake ?? 0,
      counts: ballot?.counts ?? {},
    };
  }

  return { weather: WEATHER, variations: VARIATIONS, notesMax: NOTES_MAX, ...view, me };
}

export const actions = {
  login: loginAction('/track-selection'),
  logout: logoutAction('/track-selection'),

  pick: async (event) => {
    const db = event.locals.db;
    const voter = getVoter(event);
    if (!voter) return fail(401, { error: 'Sign in with your passcode first.' });
    const selection = await getCurrentSelection(db);
    if (!selection) return fail(404, { error: 'There is no track selection open.' });
    const form = await event.request.formData();
    const raw = Object.fromEntries(['trackId', 'configId', 'weather', 'variation', 'notes'].map((k) => [k, form.get(k)]));
    try {
      await savePick(db, { selection, custId: voter.custId, raw });
      return { saved: true };
    } catch (e) {
      return fail(400, { error: e.message });
    }
  },

  // A ballot on the community vote: the clicks on each layout, keyed
  // `cand:<trackId>:<configId>`. Results are tagged `vote` so the page can
  // tell them from the pick form's.
  vote: async (event) => {
    const db = event.locals.db;
    const voter = getVoter(event);
    if (!voter) return fail(401, { vote: true, error: 'Sign in with your passcode first.' });
    const selection = await getCurrentSelection(db);
    if (!selection?.vote) return fail(404, { vote: true, error: 'There is no community vote running.' });
    const form = await event.request.formData();
    const raw = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith('cand:')).map(([k, v]) => [k.slice(5), v || 0]));
    try {
      const { clicks, stake } = await saveStake(db, { selection, custId: voter.custId, raw });
      return { vote: true, saved: true, clicks, stake };
    } catch (e) {
      return fail(400, { vote: true, error: e.message });
    }
  },
};
