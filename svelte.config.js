import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // Standalone Node server in build/ (`node build`), run in the Compose stack.
    adapter: adapter(),
    // A tab left open across a deploy keeps its old page modules but fetches
    // fresh data from the new server, so a changed page shape (a renamed load
    // field, say) throws mid-navigation. Polling the build version lets the
    // client notice a deploy and make its next navigation a full page load.
    version: { pollInterval: 60_000 },
  },
  compilerOptions: { runes: true },
};
