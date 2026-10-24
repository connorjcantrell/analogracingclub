import { fail } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { listCodes, generateMissingCodes, regenerateCode } from '$lib/server/vote/index.js';
import {
  TRACK_TYPES, getCurrentSelection, createSelection, deleteSelection, selectionView,
} from '$lib/server/track-selection/index.js';

// Admin side of the track selection: name the drivers who pick and the track
// types they may pick from, then hand each of them their passcode. The
// passcodes are the same ones the car vote uses (one per driver), so a driver
// who already has one signs straight in. The admin gate ran in hooks.server.js.
export async function load({ locals }) {
  const db = locals.db;
  const [selection, codes] = await Promise.all([getCurrentSelection(db), listCodes(db)]);
  const view = selection ? await selectionView(db, selection) : null;
  const codeOf = new Map(codes.map((c) => [c.custId, c.code]));
  return {
    trackTypes: TRACK_TYPES,
    drivers: codes.map(({ custId, displayName }) => ({ custId, displayName })),
    current: view && {
      ...view,
      pickers: view.pickers.map((p) => ({ ...p, code: codeOf.get(p.custId) ?? null })),
    },
  };
}

export const actions = {
  create: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      const doc = await createSelection(locals.db, {
        title: form.get('title'),
        trackTypes: form.getAll('trackTypes'),
        custIds: form.getAll('drivers'),
      });
      // Pickers need a passcode to sign in; mint any that are missing now.
      const made = await generateMissingCodes(locals.db);
      return { panel: 'create', ok: `${doc.title} is open at /track-selection.${made ? ` ${made} passcode${made === 1 ? '' : 's'} generated.` : ''}` };
    } catch (e) {
      return fail(400, { panel: 'create', error: e.message });
    }
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData();
    await deleteSelection(locals.db, String(form.get('id')));
    return { panel: 'current', ok: 'Selection and its picks deleted.' };
  },

  regenerateCode: async ({ request, locals }) => {
    const form = await request.formData();
    const custId = Number(form.get('custId'));
    if (!Number.isFinite(custId)) return fail(400, { panel: 'current', error: 'Missing driver.' });
    await regenerateCode(locals.db, custId);
    return { panel: 'current', ok: 'New passcode issued. The old one is dead.' };
  },
};
