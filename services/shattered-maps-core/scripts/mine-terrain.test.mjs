/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listLogFiles, mineFiles, parseArgs } from './mine-terrain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const built = fs.existsSync(dist);

test('parseArgs needs a tally and either logs or a map with its output, checks the numbers and refuses a wwwroot output', () => {
  assert.deepEqual(parseArgs(['--logs', 'l', '--tally', 't']), { logs: 'l', tally: 't' });
  assert.deepEqual(parseArgs(['--', '--tally', 't', '--in', 'm', '--out', 'o', '--min-share', '0.8', '--min-count', '3']), { tally: 't', in: 'm', out: 'o', 'min-share': '0.8', 'min-count': '3' });
  assert.throws(() => parseArgs(['--logs', 'l']), /--tally is required/);
  assert.throws(() => parseArgs(['--tally', 't']), /give --logs/);
  assert.throws(() => parseArgs(['--tally', 't', '--in', 'm']), /--in needs --out/);
  assert.throws(() => parseArgs(['--tally', 't', '--logs', 'l', '--out', 'o']), /--out needs --in/);
  assert.throws(() => parseArgs(['--tally', 't', '--logs', 'l', '--min-share', '0']), /--min-share/);
  assert.throws(() => parseArgs(['--tally', 't', '--logs', 'l', '--min-share', '1.5']), /--min-share/);
  assert.throws(() => parseArgs(['--tally', 't', '--logs', 'l', '--min-count', '0']), /--min-count/);
  assert.throws(() => parseArgs(['--tally', 't', '--logs', 'l', '--min-count', '1.5']), /--min-count/);
  assert.throws(() => parseArgs(['--tally', 't', '--in', 'm', '--out', 'C:/repo/wwwroot/x.json']), /may not be under a wwwroot folder/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--logs']), /--logs needs a value/);
  assert.throws(() => parseArgs(['--logs', '--tally']), /--logs needs a value/);
});

const record = (room, sector) => JSON.stringify({ type: 'game:remote-server:gmcp', payload: { data: `room_data ${JSON.stringify({ room, sector, exits: [] })}` } });

function corpus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrain-'));
  fs.mkdirSync(path.join(dir, '2026', '01'), { recursive: true });
  fs.writeFileSync(path.join(dir, '2026', '01', 'a.jsonl'), [record('The Temple', 'inside'), 'not json at all', record('Forest Path', 'forest'), ''].join('\n'));
  fs.writeFileSync(path.join(dir, 'b.jsonl'), [record('The Temple', 'inside'), JSON.stringify({ payload: { data: 'char_data {}' } })].join('\n'));
  fs.writeFileSync(path.join(dir, 'ignored.txt'), record('Ignored', 'city'));
  return dir;
}

test('listLogFiles finds the .jsonl files at any depth, sorted, and nothing else', () => {
  const dir = corpus();
  const files = listLogFiles(dir).map((f) => path.relative(dir, f).replaceAll('\\', '/'));
  assert.deepEqual(files, ['2026/01/a.jsonl', 'b.jsonl']);
});

test('mineFiles tallies the room_data messages of the files and skips every other line', { skip: !built && 'build the package first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const tally = await mineFiles(listLogFiles(corpus()), core);
  assert.equal(tally.records, 3);
  assert.deepEqual(tally.sectors, { inside: 2, forest: 1 });
  assert.deepEqual(tally.titles['the temple'], { inside: 2 });
});

test('the command mines a folder, then gives the terrain to a map and reports it', { skip: !built && 'build the package first' }, () => {
  const dir = corpus();
  const room = (id, title, sector) => ({ id, title, exits: {}, sources: [], ...(sector ? { sector } : {}) });
  const map = { version: 1, continents: [{ id: 'c', name: 'C', areas: [{ id: 'a', name: 'A', placement: { x: 0, y: 0, width: 1, height: 1 }, subzones: [{ id: 's', name: 'S', kind: 'consistent', rooms: [room('r1', 'The Temple'), room('r2', 'Forest Path'), room('r3', 'Nowhere'), room('r4', 'The Temple', 'city')] }], sources: [] }] }], links: [] };
  const input = path.join(dir, 'in.json');
  const out = path.join(dir, 'out', 'terrain.json');
  fs.writeFileSync(input, JSON.stringify(map));
  const run = spawnSync(process.execPath, [path.join(here, 'mine-terrain.mjs'), '--logs', dir, '--tally', path.join(dir, 'tally.json'), '--in', input, '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /read 2 files: 3 room_data messages, 2 room titles/);
  assert.match(run.stdout, /inside\s+2\s+#6F6BA8/);
  assert.match(run.stdout, /terrain given 2 \(50\.0%\), kept 1, title shared by several sectors 0, title never seen in the logs 1/);
  const rooms = JSON.parse(fs.readFileSync(out, 'utf8')).continents[0].areas[0].subzones[0].rooms;
  assert.deepEqual(rooms.map((r) => r.sector), ['inside', 'forest', undefined, 'city']);
  assert.ok(fs.existsSync(path.join(dir, 'tally.json')));

  // applying a saved tally needs no logs
  const again = spawnSync(process.execPath, [path.join(here, 'mine-terrain.mjs'), '--tally', path.join(dir, 'tally.json'), '--in', input, '--out', path.join(dir, 'again.json'), '--min-share', '1'], { encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /terrain given 2/);
});

test('the command stops with a message when there is nothing to read', { skip: !built && 'build the package first' }, () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'terrain-empty-'));
  const run = spawnSync(process.execPath, [path.join(here, 'mine-terrain.mjs'), '--logs', empty, '--tally', path.join(empty, 't.json')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no \.jsonl files/);
  const bad = spawnSync(process.execPath, [path.join(here, 'mine-terrain.mjs')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--tally is required/);
});
