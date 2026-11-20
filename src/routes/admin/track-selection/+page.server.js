import { fail } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { listCodes, generateMissingCodes, regenerateCode } from '$lib/server/vote/index.js';
import { getTracks } from '$lib/server/tracks/index.js';
import { computeStake } from '$lib/server/stake/index.js';
import { leagueTime } from '$lib/format.js';
import {
  TRACK_TYPES, WEATHER, VARIATIONS, getCurrentSelection, createSelection, deleteSelection, selectionView,
  removeDriver, restoreDriver, openVote, rescheduleVote, closeVote, deleteVote, voteBallots,
} from '$lib/server/track-selection/index.js';

// Admin side of the track selection: name the drivers who pick and the track
// types they may pick from, hand each of them their passcode, take out a
// driver who opts out, and run the community vote that fills their round.
// The passcodes are the same ones the car vote uses (one per driver), so a
// driver who already has one signs straight in. The admin gate ran in
// hooks.server.js.
export async function load({ locals }) {
  const db = locals.db;
  const [selection, codes, allSeries] = await Promise.all([
    getCurrentSelection(db),
    listCodes(db),
    collections(db).series.find({}, { projection: { slug: 1, name: 1, status: 1 } }).sort({ status: 1, name: 1 }).toArray(),
  ]);
  const view = selection ? await selectionView(db, selection) : null;
  const codeOf = new Map(codes.map((c) => [c.custId, c.code]));

  // The vote's ballots and every driver's stake in its series, for the chase list.
  let ballots = [], stakes = {}, pending = [];
  if (selection?.vote) {
    const [catalog, { drivers }] = await Promise.all([getTracks(db), computeStake(db, { seriesSlug: selection.vote.seriesSlug })]);
    ballots = await voteBallots(db, selection, catalog);
    stakes = Object.fromEntries(drivers.map((d) => [d.custId, d.stake]));
    const voted = new Set(ballots.map((b) => b.custId));
    pending = codes.filter((d) => (stakes[d.custId] ?? 0) > 0 && !voted.has(d.custId)).map((d) => d.displayName);
  }

  return {
    trackTypes: TRACK_TYPES,
    weather: WEATHER,
    variations: VARIATIONS,
    drivers: codes.map(({ custId, displayName }) => ({ custId, displayName })),
    series: allSeries.map((s) => ({ slug: s.slug, name: s.name, status: s.status })),
    current: view && {
      ...view,
      pickers: view.pickers.map((p) => ({ ...p, code: codeOf.get(p.custId) ?? null })),
      ballots, stakes, pending,
    },
  };
}

// Every action on the current selection names its id, so a stale tab can't
// act on a selection that has since been replaced.
async function current(db, form) {
  const selection = await getCurrentSelection(db);
  if (!selection || selection._id !== String(form.get('id'))) throw new Error('That selection is no longer current. Reload the page.');
  return selection;
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

  // A driver opts out: off the roster, pick gone, round handed to the club.
  removeDriver: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      const selection = await current(locals.db, form);
      const custId = Number(form.get('custId'));
      await removeDriver(locals.db, selection, custId);
      const name = selection.drivers.find((d) => d.custId === custId)?.displayName ?? 'Driver';
      return { panel: 'current', ok: `${name} removed. Their round goes to the community vote${selection.vote ? '.' : ': open it below.'}` };
    } catch (e) {
      return fail(400, { panel: 'current', error: e.message });
    }
  },

  restoreDriver: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      const selection = await current(locals.db, form);
      await restoreDriver(locals.db, selection, Number(form.get('custId')));
      return { panel: 'current', ok: 'Driver restored to the roster.' };
    } catch (e) {
      return fail(400, { panel: 'current', error: e.message });
    }
  },

  // Open the community vote: the series whose stake is spent and a Pacific
  // window. The ballot is every eligible layout, so there is nothing to list.
  openVote: async ({ request, locals }) => {
    const db = locals.db;
    const form = await request.formData();
    const seriesSlug = String(form.get('seriesSlug') ?? '');
    const days = Number(form.get('days') ?? 3);
    const startAt = leagueTime(form.get('startsAt'));
    const endAt = leagueTime(form.get('endsAt'));
    if (startAt === undefined || endAt === undefined) return fail(400, { panel: 'vote', error: 'Unreadable time.' });
    const start = startAt ?? new Date();
    if (!endAt && (!Number.isFinite(days) || days <= 0)) return fail(400, { panel: 'vote', error: 'Set an end time or a positive number of days.' });
    const end = endAt ?? new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    try {
      const selection = await current(db, form);
      if (!seriesSlug) throw new Error('Pick the series whose stake is spent.');
      // Stake is a share of the series' points; without results nobody holds any.
      const { pool } = await computeStake(db, { seriesSlug });
      if (!(pool > 0)) throw new Error('Nobody holds a stake there: the series has no season, or its season has no results yet. Pick the completed season\'s series.');
      await openVote(db, selection, { seriesSlug, startsAt: start, endsAt: end });
      return { panel: 'vote', ok: 'Community vote open at /track-selection.' };
    } catch (e) {
      return fail(400, { panel: 'vote', error: e.message });
    }
  },

  rescheduleVote: async ({ request, locals }) => {
    const form = await request.formData();
    const startsAt = leagueTime(form.get('startsAt'));
    const endsAt = leagueTime(form.get('endsAt'));
    if (startsAt === undefined || endsAt === undefined) return fail(400, { panel: 'vote', error: 'Unreadable time.' });
    if (!startsAt && !endsAt) return fail(400, { panel: 'vote', error: 'Set a start or an end time.' });
    try {
      await rescheduleVote(locals.db, await current(locals.db, form), { startsAt, endsAt });
      return { panel: 'vote', ok: 'Vote window updated.' };
    } catch (e) {
      return fail(400, { panel: 'vote', error: e.message });
    }
  },

  closeVote: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      await closeVote(locals.db, await current(locals.db, form));
      return { panel: 'vote', ok: 'Vote closed. The result is final.' };
    } catch (e) {
      return fail(400, { panel: 'vote', error: e.message });
    }
  },

  deleteVote: async ({ request, locals }) => {
    const form = await request.formData();
    try {
      await deleteVote(locals.db, await current(locals.db, form));
      return { panel: 'vote', ok: 'Vote and its ballots deleted.' };
    } catch (e) {
      return fail(400, { panel: 'vote', error: e.message });
    }
  },
};
