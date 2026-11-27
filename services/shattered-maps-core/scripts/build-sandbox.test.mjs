/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { nameWalked, parseArgs, readSandboxLayer } from './build-sandbox.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const ok = ['--world', 'sandbox', '--walked', 'w', '--out', 'o', '--date', '2026-11-11'];

test('parseArgs needs the three paths, only the sandbox world, a real date and no wwwroot output', () => {
  assert.deepEqual(parseArgs(ok), { world: 'sandbox', walked: 'w', out: 'o', date: '2026-11-11' });
  assert.match(parseArgs(['--', ...ok.slice(0, 6)]).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => parseArgs(['--world', 'dsl', '--walked', 'w', '--out', 'o']), /Simulacrum's map only/);
  assert.throws(() => parseArgs(['--world', 'sandbox', '--walked', 'w']), /--out is required/);
  assert.throws(() => parseArgs([...ok, '--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--world']), /--world needs a value/);
  assert.throws(() => parseArgs([...ok.slice(0, 6), '--date', 'soon']), /--date must be YYYY-MM-DD/);
  assert.throws(() => parseArgs(['--world', 'sandbox', '--walked', 'w', '--out', 'C:/repo/Server/wwwroot/x.json']), /may not be under a wwwroot folder/);
});

const room = (id, title, exits = {}) => ({ id, title, exits, sources: [{ kind: 'walked', date: '2026-11-01' }] });
const link = (id, from, dir, to) => ({ id, from, dir, to, state: 'candidate', confidence: 0.6, offPage: false, traversals: 1, reverse: false });
const walkedMap = () => ({
  version: 1,
  continents: [{ id: 'walked', name: 'walked', areas: [{ id: 'walked', name: 'walked', placement: null, subzones: [{ id: 'walked-main', name: 'walked-main', kind: 'consistent', rooms: [room('r1', 'Hall', { N: 'l1' }), room('r2', 'Study')] }] }] }],
  links: [link('l1', 'r1', 'N', 'r2')],
});

function layer(dir, world) {
  const file = path.join(dir, 'memory.json');
  fs.writeFileSync(file, JSON.stringify({ v: 1, map: walkedMap() }));
  if (world !== null) fs.writeFileSync(`${file}.progress.json`, JSON.stringify({ version: 1, world, lastDay: '2026-11-01', days: 1, totals: {} }));
  return file;
}

test('readSandboxLayer refuses a layer with no progress file or built for another world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sandbox-'));
  try {
    assert.throws(() => readSandboxLayer(layer(dir, null)), /does not say which world/);
    assert.throws(() => readSandboxLayer(layer(dir, 'dsl')), /belongs to the dsl world, not sandbox/);
    assert.equal(readSandboxLayer(layer(dir, 'sandbox')).continents[0].areas[0].subzones[0].rooms.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nameWalked names the continent, area and subzone and places the area, without changing its input', () => {
  const input = walkedMap();
  const before = JSON.stringify(input);
  const named = nameWalked(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(named.continents[0].name, 'Simulacrum');
  assert.equal(named.continents[0].areas[0].name, 'Walked so far');
  assert.deepEqual(named.continents[0].areas[0].placement, { x: 0, y: 0, w: 20, h: 20 });
  assert.equal(named.continents[0].areas[0].subzones[0].name, 'Walked');
});

test('the command line writes a laid-out map, and refuses the DSL layer', { skip: !fs.existsSync(dist) && 'the core package is not built' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sandbox-'));
  try {
    const out = path.join(dir, 'out', 'audited-map.json');
    const run = (file) => spawnSync(process.execPath, [path.join(here, 'build-sandbox.mjs'), '--world', 'sandbox', '--walked', file, '--out', out, '--date', '2026-11-11'], { encoding: 'utf8' });

    const bad = run(layer(dir, 'dsl'));
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /belongs to the dsl world/);
    assert.equal(fs.existsSync(out), false);

    const good = run(layer(dir, 'sandbox'));
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).placed, 2);
    const map = JSON.parse(fs.readFileSync(out, 'utf8'));
    const rooms = map.continents[0].areas[0].subzones[0].rooms;
    assert.deepEqual(rooms.map((r) => r.coords), [{ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }]);
    assert.equal(map.generatedAt, '2026-11-11');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
