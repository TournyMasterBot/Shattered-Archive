/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyLayout, parseArgs, readSpec } from './layout-continent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const built = fs.existsSync(dist);

test('parseArgs needs the map, the spec and the output, a known size mode and no wwwroot output', () => {
  assert.deepEqual(parseArgs(['--in', 'a', '--spec', 'b', '--out', 'c']), { in: 'a', spec: 'b', out: 'c' });
  assert.equal(parseArgs(['--', '--in', 'a', '--spec', 'b', '--out', 'c', '--size-by', 'rooms'])['size-by'], 'rooms');
  assert.throws(() => parseArgs(['--in', 'a', '--spec', 'b']), /--out is required/);
  assert.throws(() => parseArgs(['--in', 'a', '--spec', 'b', '--out', 'c', '--size-by', 'big']), /extent or rooms/);
  assert.throws(() => parseArgs(['--in', 'a', '--spec', 'b', '--out', 'C:/repo/wwwroot/x.json']), /may not be under a wwwroot folder/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--in']), /--in needs a value/);
});

test('readSpec accepts the documented shape and names the first thing wrong', () => {
  const good = { continent: 'c', center: 'a', relations: [{ area: 'b', of: 'a', dir: 'W' }], gap: 2, sizeBy: 'rooms' };
  assert.equal(readSpec(good), good);
  assert.throws(() => readSpec(null), /must be an object/);
  assert.throws(() => readSpec([]), /must be an object/);
  assert.throws(() => readSpec({ center: 'a', relations: [] }), /needs "continent"/);
  assert.throws(() => readSpec({ continent: 'c', center: '', relations: [] }), /needs "center"/);
  assert.throws(() => readSpec({ continent: 'c', center: 'a' }), /needs "relations"/);
  assert.throws(() => readSpec({ continent: 'c', center: 'a', relations: [{ area: 'b' }] }), /relation 0/);
  assert.throws(() => readSpec({ continent: 'c', center: 'a', relations: [null] }), /relation 0/);
  assert.throws(() => readSpec({ continent: 'c', center: 'a', relations: [], gap: 99 }), /"gap"/);
  assert.throws(() => readSpec({ continent: 'c', center: 'a', relations: [], sizeBy: 'huge' }), /"sizeBy"/);
});

const room = (id) => ({ id, title: id, exits: {}, sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
const area = (id, placement, rooms = 1) => ({ id, name: id, placement, subzones: [{ id: `${id}-s`, name: 'Main', kind: 'consistent', rooms: Array.from({ length: rooms }, (_, i) => room(`${id}-r${i}`)) }], sources: [] });
const mapOf = (areas) => ({ version: 1, generatedAt: '2026-11-12', continents: [{ id: 'c1', name: 'C', areas }, { id: 'c2', name: 'Other', areas: [area('z', { x: 0, y: 0, w: 3, h: 3 })] }], links: [] });

test('applyLayout moves only the areas of the one continent, adds and removes nothing, and reports the overlap before and after', { skip: !built && 'build the core first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const input = mapOf([area('a', { x: 0, y: 0, w: 10, h: 10 }, 4), area('b', { x: 2, y: 2, w: 6, h: 6 }, 2), area('c', { x: 3, y: 3, w: 3, h: 3 }, 1), area('free', null, 1)]);
  const before = JSON.stringify(input);
  const { map, report } = applyLayout(input, { continent: 'c1', center: 'a', relations: [{ area: 'b', of: 'a', dir: 'E' }] }, core);
  assert.equal(JSON.stringify(input), before, 'the input map is not changed');
  assert.equal(report.overlappingPairsBefore, 3);
  assert.equal(report.overlappingPairsAfter, 0);
  assert.equal(report.areas, 3);
  assert.equal(report.unplacedAreas, 1);
  assert.equal(report.sizeBy, 'extent');
  assert.deepEqual(report.warnings, []);
  assert.equal(map.continents[1], input.continents[1], 'the other continent is the same object');
  assert.deepEqual(map.continents[0].areas.map((a) => a.id), ['a', 'b', 'c', 'free']);
  assert.equal(map.continents[0].areas[3].placement, null, 'an area with no placement stays without one');
  assert.ok(map.continents[0].areas[1].placement.x > map.continents[0].areas[0].placement.x, 'b is east of a');
  assert.equal(core.validateMapFile(map).ok, true);
  assert.throws(() => applyLayout(input, { continent: 'nope', center: 'a', relations: [] }, core), /continent nope is not in the map/);
  assert.equal(applyLayout(input, { continent: 'c1', center: 'a', relations: [], sizeBy: 'rooms' }, core).report.sizeBy, 'rooms');
});

test('the command line writes the new map and prints the report; a bad spec is an error', { skip: !built && 'build the core first' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-continent-'));
  try {
    const input = path.join(dir, 'in.json');
    const spec = path.join(dir, 'spec.json');
    const out = path.join(dir, 'out', 'map.json');
    fs.writeFileSync(input, JSON.stringify(mapOf([area('a', { x: 0, y: 0, w: 5, h: 5 }, 2), area('b', { x: 1, y: 1, w: 5, h: 5 }, 2)])));
    fs.writeFileSync(spec, JSON.stringify({ continent: 'c1', center: 'a', relations: [] }));
    const run = spawnSync(process.execPath, [path.join(here, 'layout-continent.mjs'), '--in', input, '--spec', spec, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.overlappingPairsBefore, 1);
    assert.equal(report.overlappingPairsAfter, 0);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).continents.length, 2);

    fs.writeFileSync(spec, JSON.stringify({ continent: 'c1' }));
    const bad = spawnSync(process.execPath, [path.join(here, 'layout-continent.mjs'), '--in', input, '--spec', spec, '--out', out], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /layout-continent: the spec needs "center"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
