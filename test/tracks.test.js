import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfigsPage, groupTracks, slugify } from '../src/lib/server/tracks/index.js';

// A slice of the SRH table as served: the config cell's anchor is left
// unclosed, single-layout tracks have an empty config, names carry entities.
const PAGE = `
<table id='config_table'><tr class='jsTableHdr'><th>Track</th></tr>
<tr class='jsTableRow' id='cfg_475'><td class='wrap'><a href='config_stats.php?config_id=475'>Adelaide Street Circuit</a></td><td><a href='config_stats.php?config_id=475'></td><td class='wrap'>Adelaide Street Circuit</td><td class='ctr'>No</td><td class='ctr'>2.012</td><td class='rgt'>14</td><td>Road Course</td><td class='ctr'>No</td><td class='rgt'>135</td><td class='rgt'>176</td></tr>
<tr class='jsTableRow' id='cfg_12'><td class='wrap'><a href='x'>Charlotte Motor Speedway</a></td><td><a href='x'>Oval</td><td class='wrap'>Oval</td><td class='ctr'>Yes</td><td class='ctr'>1.500</td><td class='rgt'>4</td><td>Speedway</td><td class='ctr'>Yes</td><td class='rgt'>1318</td><td class='rgt'>1944</td></tr>
<tr class='jsTableRow' id='cfg_13'><td class='wrap'><a href='x'>Charlotte Motor Speedway</a></td><td><a href='x'>Roval 2025</td><td class='wrap'>Roval 2025</td><td class='ctr'>Yes</td><td class='ctr'>2.280</td><td class='rgt'>17</td><td>Road Course</td><td class='ctr'>Yes</td><td class='rgt'>205</td><td class='rgt'>327</td></tr>
<tr class='jsTableRow' id='cfg_14'><td class='wrap'><a href='x'>Charlotte Motor Speedway</a></td><td><a href='x'>[Retired] Road Course</td><td class='wrap'>Charlotte Road</td><td class='ctr'>Yes</td><td class='ctr'>2.250</td><td class='rgt'>12</td><td>Road Course</td><td class='ctr'>Yes</td><td class='rgt'>304</td><td class='rgt'>280</td></tr>
<tr class='jsTableRow' id='cfg_99'><td class='wrap'><a href='x'>[Retired] Charlotte Motor Speedway</a></td><td><a href='x'>[Retired] Oval - 2018</td><td class='wrap'>[Retired] Charlotte Oval - 2018</td><td class='ctr'>Yes</td><td class='ctr'>1.500</td><td class='rgt'>4</td><td>Speedway</td><td class='ctr'>Yes</td><td class='rgt'>4144</td><td class='rgt'>4793</td></tr>
<tr class='jsTableRow' id='cfg_90'><td class='wrap'><a href='x'>Watkins Glen International</a></td><td><a href='x'>Boot</td><td class='wrap'>Watkins Glen Boot [Retired]</td><td class='ctr'>No</td><td class='ctr'>3.400</td><td class='rgt'>12</td><td>Road Course</td><td class='ctr'>No</td><td class='rgt'>1</td><td class='rgt'>1</td></tr>
<tr class='jsTableRow' id='cfg_7'><td class='wrap'><a href='x'>N&uuml;rburgring Grand-Prix-Strecke</a></td><td><a href='x'>Grand Prix</td><td class='wrap'>N&uuml;rburgring GP</td><td class='ctr'>No</td><td class='ctr'>3.199</td><td class='rgt'>15</td><td>Road Course</td><td class='ctr'>No</td><td class='rgt'>1</td><td class='rgt'>2</td></tr>
</table>`;

test('parseConfigsPage reads one layout per row and drops the usage counts', () => {
  const rows = parseConfigsPage(PAGE);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], {
    srhConfigId: 475, track: 'Adelaide Street Circuit', config: null, shortName: 'Adelaide Street Circuit',
    type: 'Road Course', lengthMi: 2.012, turns: 14, free: false, night: false,
  });
  assert.deepEqual(rows[1], {
    srhConfigId: 12, track: 'Charlotte Motor Speedway', config: 'Oval', shortName: 'Oval',
    type: 'Speedway', lengthMi: 1.5, turns: 4, free: true, night: true,
  });
  assert.equal(rows[6].track, 'Nürburgring Grand-Prix-Strecke');
  assert.equal(rows[6].shortName, 'Nürburgring GP');
});

test('groupTracks folds layouts into one doc per track and leaves retired ones out', () => {
  const tracks = groupTracks(parseConfigsPage(PAGE));
  assert.deepEqual(tracks.map((t) => t._id), [
    'adelaide-street-circuit', 'charlotte-motor-speedway', 'n-rburgring-grand-prix-strecke',
  ], 'the retired Charlotte and the Glen layout tagged only in its short name are gone');
  const charlotte = tracks[1];
  assert.deepEqual(charlotte.configs.map((c) => [c.name, c.shortName, c.type, c.lengthMi, c.turns]), [
    ['Oval', 'Oval', 'Speedway', 1.5, 4],
    ['Roval 2025', 'Roval 2025', 'Road Course', 2.28, 17],
  ], 'the retired Charlotte road course is dropped from a current track');
  assert.equal(tracks[0].configs[0].name, null, 'a single-layout track has no config name');
  assert.equal(Object.hasOwn(tracks[0], 'retired'), false);
});

test('slugify keeps ids stable and url-safe', () => {
  assert.equal(slugify('Daytona Rallycross and Dirt Road'), 'daytona-rallycross-and-dirt-road');
  assert.equal(slugify('[Retired] Charlotte Motor Speedway'), 'retired-charlotte-motor-speedway');
});
