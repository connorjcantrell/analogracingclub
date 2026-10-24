import { fail, redirect } from '@sveltejs/kit';
import { clientIp, loginLocked, recordLogin } from '../admin/auth.js';
import { issueVoterSession, voterCookieOptions, VOTER_COOKIE } from './auth.js';
import { driverForCode } from './index.js';

// The passcode sign-in and sign-out, shared by every page gated on a driver's
// vote passcode. Throttled per IP like the admin form.
export const loginAction = (redirectTo) => async (event) => {
  const ip = clientIp(event);
  if (loginLocked(ip)) return fail(429, { login: true, error: 'Too many attempts. Try again in a few minutes.' });
  const form = await event.request.formData();
  const driver = await driverForCode(event.locals.db, form.get('code'));
  recordLogin(ip, !!driver);
  if (!driver) return fail(401, { login: true, error: "That passcode doesn't match any driver." });
  event.cookies.set(VOTER_COOKIE, issueVoterSession(driver._id), voterCookieOptions(event));
  redirect(303, redirectTo);
};

export const logoutAction = (redirectTo) => async (event) => {
  event.cookies.delete(VOTER_COOKIE, { path: '/' });
  redirect(303, redirectTo);
};
