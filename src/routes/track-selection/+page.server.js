import { fail } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { getVoter } from '$lib/server/vote/auth.js';
import { loginAction, logoutAction } from '$lib/server/vote/login.js';
import {
  WEATHER, VARIATIONS, NOTES_MAX, getCurrentSelection, selectionView, savePick,
} from '$lib/server/track-selection/index.js';

// Next season's track selection: the drivers the admin named each choose one
// round. Anyone can see the board; saving a pick takes the driver's passcode.
// Eligibility is re-checked in the action, so the page state is a convenience,
// not the gate.
export async function load(event) {
  const db = event.locals.db;
  const voter = getVoter(event);
  const selection = await getCurrentSelection(db);
  if (!selection) return { selection: null, me: null };
  const view = await selectionView(db, selection);

  let me = null;
  if (voter) {
    const picker = view.pickers.find((p) => p.custId === voter.custId);
    const driver = picker ? null : await collections(db).drivers.findOne({ _id: voter.custId });
    me = {
      custId: voter.custId,
      driverName: picker?.displayName ?? driver?.displayName ?? `#${voter.custId}`,
      picker: !!picker,
      pick: picker?.pick ?? null,
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
};
