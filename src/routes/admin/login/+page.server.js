import { fail, redirect } from '@sveltejs/kit';
import { accessConfigured, checkPassword, issueSession, sessionCookieOptions, COOKIE_NAME, clientIp, loginLocked, recordLogin, requireAdmin } from '$lib/server/admin/auth.js';

// Under Cloudflare Access the edge owns login; the form is never shown. An
// already-signed-in admin skips it too.
export async function load(event) {
  if (accessConfigured() || (await requireAdmin(event)).ok) redirect(303, '/admin');
  return {};
}

export const actions = {
  default: async (event) => {
    if (accessConfigured()) redirect(303, '/admin');
    const ip = clientIp(event);
    if (loginLocked(ip)) return fail(429, { error: 'locked' });
    const form = await event.request.formData();
    const ok = checkPassword(form.get('password'));
    recordLogin(ip, ok);
    if (!ok) return fail(401, { error: 'wrong' });
    event.cookies.set(COOKIE_NAME, issueSession(), sessionCookieOptions(event));
    redirect(303, '/admin');
  },
};
