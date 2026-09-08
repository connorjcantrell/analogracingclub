import { readFile } from 'node:fs/promises';
import { getDb, closeDb } from '../db/index.js';
import { ingestEventResult } from './ingest.js';

// npm run ingest <file.json> -- --series season-1 --round 1
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('usage: node src/import/cli.js <file.json> --series <slug> --round <n>'); process.exit(1); }

const db = await getDb();
try {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const out = await ingestEventResult(db, parsed, {
    seriesSlug: opt('series'), round: opt('round') ? Number(opt('round')) : null,
  });
  console.log(`ingested ${out.subsessionId}: ${out.drivers} drivers, ${out.results} results`);
} finally {
  await closeDb();
}
