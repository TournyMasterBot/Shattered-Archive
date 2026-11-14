/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parseArgs } from './build-audited.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const ok = ['--world', 'dsl', '--azah', 'a', '--trace', 't', '--out', 'o', '--date', '2026-11-11'];

test('parseArgs needs the four paths, only the DSL, a real date and no wwwroot output', () => {
  assert.deepEqual(parseArgs(ok), { world: 'dsl', azah: 'a', trace: 't', out: 'o', date: '2026-11-11' });
  assert.match(parseArgs(['--', ...ok.slice(0, 8)]).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => parseArgs(['--world', 'sandbox', '--azah', 'a', '--trace', 't', '--out', 'o']), /Azah mapped the DSL only/);
  assert.throws(() => parseArgs(['--world', 'dsl', '--azah', 'a', '--trace', 't']), /--out is required/);
  assert.throws(() => parseArgs([...ok, '--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--world']), /--world needs a value/);
  assert.throws(() => parseArgs(['--world', 'dsl', '--azah', 'a', '--trace', 't', '--out', 'o', '--date', 'soon']), /--date must be YYYY-MM-DD/);
  assert.throws(() => parseArgs(['--world', 'dsl', '--azah', 'a', '--trace', 't', '--out', 'C:/repo/Server/wwwroot/data/map.json']), /may not be under a wwwroot folder/);
});

const room = (id, title, exits = {}) => ({ id, title, description: 'x', exits, sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
const link = (id, from, dir, to) => ({ id, from, dir, to, state: 'candidate', confidence: 0.4, offPage: false, traversals: 0, reverse: false });

test('the command line writes the audited map with the walked evidence on it, and refuses a trace without evidence', { skip: !fs.existsSync(dist) && 'the core package is not built' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-audited-'));
  try {
    const azah = path.join(dir, 'azah');
    fs.mkdirSync(azah);
    fs.writeFileSync(path.join(azah, 'manifest.json'), JSON.stringify({ source: { name: 'azah' } }));
    const slice = {
      version: 1,
      continents: [{ id: 'c1', name: 'C', areas: [{ id: 'az-a1', name: 'A', placement: null, subzones: [{ id: 'az-s1', name: 'S', kind: 'consistent', rooms: [room('az1', 'Hall', { N: 'azl1' }), room('az2', 'Study')] }] }] }],
      links: [link('azl1', 'az1', 'N', 'az2')],
    };
    fs.writeFileSync(path.join(azah, 'az-a1.json.gz'), gzipSync(JSON.stringify(slice)));
    const trace = path.join(dir, 'trace.json');
    fs.writeFileSync(trace, JSON.stringify({ report: { counts: { azahRooms: 2, azahLinks: 1 }, links: { azl1: 'agree' }, evidence: { azl1: { agree: 4, disagree: 0, lastDay: '2026-07-03', seenTo: [] } }, walkedOn: { az1: { first: '2026-07-03', last: '2026-07-03' } } } }));
    const out = path.join(dir, 'out', 'audited-map.json');
    const run = (traceFile) => spawnSync(process.execPath, [path.join(here, 'build-audited.mjs'), '--world', 'dsl', '--azah', azah, '--trace', traceFile, '--out', out, '--date', '2026-11-11'], { encoding: 'utf8' });

    const good = run(trace);
    assert.equal(good.status, 0, good.stderr);
    const summary = JSON.parse(good.stdout);
    assert.equal(summary.linksWalkedOnce, 1);
    assert.equal(summary.roomsWalked, 1);
    const map = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(map.generatedAt, '2026-11-11');
    assert.equal(map.links[0].state, 'candidate');
    assert.equal(map.links[0].confidence, 0.6);
    assert.equal(map.links[0].traversals, 4);

    const old = path.join(dir, 'old-trace.json');
    fs.writeFileSync(old, JSON.stringify({ report: { links: {} } }));
    const bad = run(old);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /not a trace report with link evidence/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
