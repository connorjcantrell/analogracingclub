import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // Standalone Node server in build/ (`node build`), run in the Compose stack.
    adapter: adapter(),
  },
  compilerOptions: { runes: true },
};
