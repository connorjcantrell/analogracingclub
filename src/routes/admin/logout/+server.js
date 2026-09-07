import { redirect } from '@sveltejs/kit';
import { accessConfigured, COOKIE_NAME } from '$lib/server/admin/auth.js';

export async function POST({ cookies }) {
  // Access sessions end at the edge (Cloudflare's logout endpoint on this host).
  if (accessConfigured()) redirect(303, '/cdn-cgi/access/logout');
  cookies.delete(COOKIE_NAME, { path: '/' });
  redirect(303, '/admin/login');
}
