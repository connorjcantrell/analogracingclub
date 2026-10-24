import { fail } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { computeStandings } from '$lib/server/standings/index.js';
import { startEpoch } from '$lib/format.js';
import {
  getCurrentSession, sessionStatus, tally, ballots, winners,
  listCodes, generateMissingCodes, regenerateCode,
  createSession, deleteSession, closeSession, rescheduleSession, scaleBudget, CARS,
} from '$lib/server/vote/index.js';

// A datetime-local value typed on the admin page is league (Pacific)
// wall-clock, whatever zone the server or the admin's browser is in — never
// parse it as local/UTC. Blank → null; unreadable → undefined.
const leagueTime = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const ms = startEpoch(s.slice(0, 16));
  return ms == null ? undefined : new Date(ms);
};

// Admin side of the car vote: define the session (cars, window, points
// source) and issue each driver's sign-in passcode (handed out by DM). The
// admin gate ran in hooks.server.js.
export async function load({ locals }) {
  const db = locals.db;
  const { series } = collections(db);
  const [session, codes, allSeries] = await Promise.all([
    getCurrentSession(db),
    listCodes(db),
    series.find({}, { projection: { slug: 1, name: 1, status: 1 } }).sort({ status: 1, name: 1 }).toArray(),
  ]);

  let sessionView = null;
  let budgets = {}; // custId -> points available in the current session
  if (session) {
    const [{ totals, up, down, voters }, { standings }, cast] = await Promise.all([
      tally(db, session._id),
      computeStandings(db, { seriesSlug: session.seriesSlug }),
      ballots(db, session),
    ]);
    budgets = Object.fromEntries(standings.map((r) => [r.custId, scaleBudget(r.total)]));
    const status = sessionStatus(session);
    // Drivers with votes to spend who haven't saved a ballot — the chase list.
    const voted = new Set(cast.map((b) => b.custId));
    const pending = codes
      .filter((d) => (budgets[d.custId] ?? 0) > 0 && !voted.has(d.custId))
      .map((d) => d.displayName);
    sessionView = {
      id: session._id, title: session.title, seriesSlug: session.seriesSlug, cars: session.cars,
      startsAt: new Date(session.startsAt).toISOString(), endsAt: new Date(session.endsAt).toISOString(),
      status, totals, up, down, voters, ballots: cast, pending,
      winners: status === 'closed' ? winners(session, totals).map((c) => c.name) : null,
    };
  }

  return {
    session: sessionView,
    budgets,
    codes,
    cars: CARS,
    series: allSeries.map((s) => ({ slug: s.slug, name: s.name, status: s.status })),
  };
}

export const actions = {
  create: async ({ request, locals }) => {
    const db = locals.db;
    const existing = await getCurrentSession(db);
    const existingStatus = sessionStatus(existing);
    if (existingStatus === 'open' || existingStatus === 'upcoming') {
      return fail(400, { panel: 'create', error: 'Close or delete the current vote first.' });
    }
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const seriesSlug = String(form.get('seriesSlug') ?? '');
    // Cars come from the fixed catalog (checkboxes); keep only recognized names.
    const carNames = form.getAll('cars').map(String).filter((n) => CARS.includes(n));
    const days = Number(form.get('days') ?? 3);
    if (!title) return fail(400, { panel: 'create', error: 'Give the vote a title.' });
    if (!seriesSlug) return fail(400, { panel: 'create', error: 'Pick the series whose points are spent.' });
    const startAt = leagueTime(form.get('startsAt'));
    if (startAt === undefined) return fail(400, { panel: 'create', error: 'Unreadable start time.' });
    const start = startAt ?? new Date();
    // An explicit end (Pacific) wins; otherwise the vote runs for `days`.
    const endAt = leagueTime(form.get('endsAt'));
    if (endAt === undefined) return fail(400, { panel: 'create', error: 'Unreadable end time.' });
    if (!endAt && (!Number.isFinite(days) || days <= 0)) return fail(400, { panel: 'create', error: 'Set an end time or a positive number of days.' });
    const end = endAt ?? new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    // Budgets are this series' standings totals; without results everyone
    // would have 0 points and nobody could vote.
    const { standings } = await computeStandings(db, { seriesSlug });
    if (!standings.some((r) => r.total > 0)) {
      return fail(400, { panel: 'create', error: 'That series has no scored results — every driver would have 0 points. Pick the completed season.' });
    }
    try {
      await createSession(db, { title, seriesSlug, carNames, startsAt: start, endsAt: end });
      return { panel: 'create', ok: 'Vote created.' };
    } catch (e) {
      return fail(400, { panel: 'create', error: e.message });
    }
  },

  // Move the window of the current vote — both pickers are Pacific wall-clock.
  reschedule: async ({ request, locals }) => {
    const form = await request.formData();
    const startsAt = leagueTime(form.get('startsAt'));
    const endsAt = leagueTime(form.get('endsAt'));
    if (startsAt === undefined || endsAt === undefined) return fail(400, { panel: 'session', error: 'Unreadable time.' });
    if (!startsAt && !endsAt) return fail(400, { panel: 'session', error: 'Set a start or an end time.' });
    try {
      await rescheduleSession(locals.db, String(form.get('id')), { startsAt, endsAt });
      return { panel: 'session', ok: 'Vote window updated.' };
    } catch (e) {
      return fail(400, { panel: 'session', error: e.message });
    }
  },

  close: async ({ request, locals }) => {
    const form = await request.formData();
    await closeSession(locals.db, String(form.get('id')));
    return { panel: 'session', ok: 'Vote closed — the winner is final.' };
  },

  delete: async ({ request, locals }) => {
    const form = await request.formData();
    await deleteSession(locals.db, String(form.get('id')));
    return { panel: 'session', ok: 'Vote and its ballots deleted.' };
  },

  generateCodes: async ({ locals }) => {
    const made = await generateMissingCodes(locals.db);
    return { panel: 'codes', ok: made ? `${made} passcode${made === 1 ? '' : 's'} generated.` : 'Every driver already has one.' };
  },

  regenerateCode: async ({ request, locals }) => {
    const form = await request.formData();
    const custId = Number(form.get('custId'));
    if (!Number.isFinite(custId)) return fail(400, { panel: 'codes', error: 'Missing driver.' });
    await regenerateCode(locals.db, custId);
    return { panel: 'codes', ok: 'New passcode issued — the old one is dead.' };
  },
};
