import { redirect } from '@sveltejs/kit';

// The format explainer lives in the Format section of the About page now.
export function GET() {
  redirect(301, '/about#format');
}
