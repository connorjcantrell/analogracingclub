import { readFile } from 'node:fs/promises';
import { getDb, closeDb } from '../db/index.js';
import { ingestEventResult } from './ingest.js';

// npm run ingest <file.json> -- --series season-1 --round 1 [--no-stake]
// npm run ingest <file.json> -- --special hosted-qual-race [--title X] [--format fast-four-v2] [--no-stake]
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('usage: node src/lib/server/import/cli.js <file.json> (--series <slug> --round <n> | --special <eventType> [--title X] [--format id]) [--no-stake]'); process.exit(1); }

const db = await getDb();
try {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const seriesSlug = opt('series');
  const stakeExcluded = args.includes('--no-stake');
  const out = await ingestEventResult(db, parsed, seriesSlug
    ? { seriesSlug, round: opt('round') ? Number(opt('round')) : null, stakeExcluded }
    : { eventType: opt('special'), title: opt('title'), format: opt('format'), stakeExcluded });
  console.log(`ingested ${out.subsessionId}: ${out.drivers} drivers, ${out.results} results; stake → ${out.stakeSeason ?? 'none'}`);
} finally {
  await closeDb();
}
