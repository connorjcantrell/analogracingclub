import { error, redirect } from '@sveltejs/kit';
import { FORMAT_SECTIONS } from '$lib/format-sections.js';

// A shareable address for one Format subsection: /format/long lands on the
// Long heading of the About page. Unknown sections are a 404.
export function GET({ params }) {
  if (!FORMAT_SECTIONS.some(([id]) => id === params.section)) error(404, 'No such format section');
  redirect(302, `/about#${params.section}`);
}
