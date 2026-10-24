import { fail, redirect } from '@sveltejs/kit';
import { collections } from '$lib/server/db/index.js';
import { clientIp, loginLocked, recordLogin } from '$lib/server/admin/auth.js';
import { getVoter, issueVoterSession, voterCookieOptions, VOTER_COOKIE } from '$lib/server/vote/auth.js';
import {
  getCurrentSession, sessionStatus, pointsAndBudgetFor, getBallot,
  driverForCode, saveBallot, tally, winners,
} from '$lib/server/vote/index.js';

// The hidden next-season car vote. Anyone can watch the live tally; casting a
// ballot takes the passcode the admin DMed each driver (see /admin/vote).
// All checks re-run in the action — the page state is a convenience, not the
// gate.
export async function load(event) {
  const db = event.locals.db;
  const voter = getVoter(event);
  const session = await getCurrentSession(db);
  if (!session) return { session: null, me: null };

  const status = sessionStatus(session);
  const [{ totals, up, down, upBy, downBy, voters }, series] = await Promise.all([
    tally(db, session._id),
    collections(db).series.findOne({ slug: session.seriesSlug }, { projection: { name: 1 } }),
  ]);

  let me = null;
  if (voter) {
    const [{ points, budget }, ballot, driver] = await Promise.all([
      pointsAndBudgetFor(db, session, voter.custId),
      getBallot(db, session._id, voter.custId),
      collections(db).drivers.findOne({ _id: voter.custId }),
    ]);
    me = { custId: voter.custId, driverName: driver?.displayName ?? `#${voter.custId}`, points, budget, allocation: ballot?.allocation ?? {} };
  }

  return {
    session: {
      id: session._id, title: session.title, cars: session.cars, seriesSlug: session.seriesSlug,
      seriesName: series?.name ?? session.seriesSlug,
      startsAt: new Date(session.startsAt).toISOString(), endsAt: new Date(session.endsAt).toISOString(),
    },
    status,
    totals,
    // The up/down split draws the downvoted share of each bar; the driver
    // counts feed the bar tooltips (the popular vote behind the weighted one).
    up, down, upBy, downBy,
    voters,
    winners: status === 'closed' ? winners(session, totals).map((c) => c.name) : null,
    me,
  };
}

export const actions = {
  // Passcode sign-in, throttled per IP like the admin form.
  login: async (event) => {
    const ip = clientIp(event);
    if (loginLocked(ip)) return fail(429, { login: true, error: 'Too many attempts — try again in a few minutes.' });
    const form = await event.request.formData();
    const driver = await driverForCode(event.locals.db, form.get('code'));
    recordLogin(ip, !!driver);
    if (!driver) return fail(401, { login: true, error: "That passcode doesn't match any driver." });
    event.cookies.set(VOTER_COOKIE, issueVoterSession(driver._id), voterCookieOptions(event));
    redirect(303, '/vote');
  },

  logout: async (event) => {
    event.cookies.delete(VOTER_COOKIE, { path: '/' });
    redirect(303, '/vote');
  },

  allocate: async (event) => {
    const db = event.locals.db;
    const voter = getVoter(event);
    if (!voter) return fail(401, { error: 'Sign in with your passcode first.' });
    const session = await getCurrentSession(db);
    if (!session) return fail(404, { error: 'There is no vote running.' });

    const form = await event.request.formData();
    const allocation = Object.fromEntries(session.cars.map((c) => [c.id, form.get(`car:${c.id}`) || 0]));
    try {
      const { spent, budget } = await saveBallot(db, { session, custId: voter.custId, allocation });
      return { saved: true, spent, budget };
    } catch (e) {
      return fail(400, { error: e.message });
    }
  },
};
