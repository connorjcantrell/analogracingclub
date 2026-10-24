import { readFile } from 'node:fs/promises';
import { getDb, closeDb } from '../db/index.js';
import { fetchConfigsPage, importTracks, SOURCE_URL } from './index.js';

// npm run tracks              — fetch the SRH configuration page and load it
// npm run tracks -- page.html — load a saved copy of the page instead
const file = process.argv[2];
const html = file ? await readFile(file, 'utf8') : await fetchConfigsPage();
const db = await getDb();
try {
  const out = await importTracks(db, html);
  console.log(`tracks: ${out.tracks} tracks, ${out.configs} configurations from ${file ?? SOURCE_URL}; ${out.removed} stale track(s) removed`);
} finally {
  await closeDb();
}
