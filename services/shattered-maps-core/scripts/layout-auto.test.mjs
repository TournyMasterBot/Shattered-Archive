/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { layoutAll, ownerContinents, ownerSpecs, parseArgs } from './layout-auto.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const built = fs.existsSync(dist);

test('parseArgs needs the map and the output, a known size mode and no wwwroot output', () => {
  assert.deepEqual(parseArgs(['--in', 'a', '--out', 'b']), { in: 'a', out: 'b' });
  assert.equal(parseArgs(['--', '--in', 'a', '--out', 'b', '--skip', 'x,y', '--size-by', 'extent', '--specs', 's'])['size-by'], 'extent');
  assert.throws(() => parseArgs(['--in', 'a']), /--out is required/);
  assert.throws(() => parseArgs(['--out', 'b']), /--in is required/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--size-by', 'big']), /extent or rooms/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'C:/repo/wwwroot/x.json']), /may not be under a wwwroot folder/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--in']), /--in needs a value/);
});

test('ownerContinents reads the continent of each spec file and passes over anything else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ continent: 'c1', center: 'x', relations: [] }));
  fs.writeFileSync(path.join(dir, 'kinds.json'), JSON.stringify({ 'az-s1': 'maze' }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ nope');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  assert.deepEqual(ownerContinents(dir), ['c1']);
});

const room = (id) => ({ id, title: id, exits: {}, sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
const area = (id, x, y, rooms) => ({ id, name: id, placement: { x, y, w: 5, h: 5 }, subzones: [{ id: `${id}-s`, name: 'Main', kind: 'consistent', rooms: rooms.map(room) }], sources: [] });
const link = (id, from, dir, to) => ({ id, from, dir, to, state: 'candidate', confidence: 0.5, offPage: true, traversals: 0, reverse: false });
const world = () => {
  const map = {
    version: 1,
    continents: [
      { id: 'c1', name: 'One', areas: [area('hub', 0, 0, ['h1', 'h2']), area('east', 0, 0, ['e1'])] },
      { id: 'c2', name: 'Two', areas: [area('p', 0, 0, ['p1']), area('q', 0, 0, ['q1'])] },
      { id: 'c3', name: 'Three', areas: [area('m', 0, 0, ['m1']), area('n', 9, 9, ['n1'])] },
    ],
    links: [link('l1', 'h1', 'E', 'e1'), link('l2', 'p1', 'S', 'q1')],
  };
  for (const l of map.links)
    for (const c of map.continents) for (const a of c.areas) for (const s of a.subzones) for (const r of s.rooms) if (r.id === l.from) r.exits[l.dir] = l.id;
  return map;
};

test('layoutAll lays out a continent the links join, keeps a skipped one and leaves an unjoined one', { skip: !built && 'build the package first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const { map, lines } = layoutAll(world(), new Set(['c2']), 'rooms', core);
  assert.deepEqual(lines.map((l) => l.result), ['laid out', 'kept (owner layout or skipped)', 'no link joins two areas: left as it is']);
  assert.equal(lines[0].overlappingPairsAfter, 0);
  const place = (c, a) => map.continents.find((x) => x.id === c).areas.find((x) => x.id === a).placement;
  assert.ok(place('c1', 'east').x > place('c1', 'hub').x, 'east of the hub');
  assert.deepEqual(place('c2', 'q'), { x: 0, y: 0, w: 5, h: 5 }); // skipped: untouched
  assert.deepEqual(place('c3', 'n'), { x: 9, y: 9, w: 5, h: 5 }); // no link: untouched
});

test('the command reads a map, honours the owner specs folder and writes the result', { skip: !built && 'build the package first' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-'));
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(world()));
  fs.mkdirSync(path.join(dir, 'specs'));
  fs.writeFileSync(path.join(dir, 'specs', 'c2.json'), JSON.stringify({ continent: 'c2', center: 'p', relations: [] }));
  const run = spawnSync(process.execPath, [path.join(here, 'layout-auto.mjs'), '--in', path.join(dir, 'in.json'), '--out', path.join(dir, 'out', 'map.json'), '--specs', path.join(dir, 'specs')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /laid out/);
  assert.match(run.stdout, /kept \(owner layout or skipped\)/);
  assert.ok(fs.existsSync(path.join(dir, 'out', 'map.json')));
  const bad = spawnSync(process.execPath, [path.join(here, 'layout-auto.mjs'), '--in', path.join(dir, 'in.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--out is required/);
});

test('parseArgs reads the gap, the cells per room and the folder of specs to extend, and refuses nonsense', () => {
  const a = parseArgs(['--in', 'a', '--out', 'b', '--gap', '3', '--cells-per-room', '0.8', '--extend', 'specs']);
  assert.equal(a.gap, '3');
  assert.equal(a['cells-per-room'], '0.8');
  assert.equal(a.extend, 'specs');
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--gap', '-1']), /--gap must be a whole number/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--gap', '40']), /--gap must be a whole number/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--cells-per-room', '0']), /--cells-per-room must be/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--cells-per-room', 'big']), /--cells-per-room must be/);
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'b', '--specs', 's', '--extend', 'e']), /give one/);
});

test('ownerSpecs reads each spec by its continent and passes over anything else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ continent: 'c1', center: 'x', relations: [] }));
  fs.writeFileSync(path.join(dir, 'kinds.json'), JSON.stringify({ 'az-s1': 'maze' }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ nope');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  const specs = ownerSpecs(dir);
  assert.deepEqual([...specs.keys()], ['c1']);
  assert.equal(specs.get('c1').center, 'x');
});

test('layoutAll extends an owner spec: the owner relation stays and the other areas follow their links, at the size asked for', { skip: !built && 'build the package first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const owner = new Map([['c1', { continent: 'c1', center: 'hub', relations: [] }]]);
  const small = layoutAll(world(), new Set(['c2', 'c3']), 'rooms', core, owner, { gap: 2, cellsPerRoom: 0.5 });
  const normal = layoutAll(world(), new Set(['c2', 'c3']), 'rooms', core, owner, { gap: 2 });
  assert.equal(small.lines[0].result, 'laid out (the owner spec extended)');
  const east = (r) => r.map.continents[0].areas.find((a) => a.id === 'east').placement;
  const hub = (r) => r.map.continents[0].areas.find((a) => a.id === 'hub').placement;
  assert.ok(east(small).x > hub(small).x, 'east of the hub although the owner spec does not say so');
  assert.ok(hub(small).w < hub(normal).w || hub(small).w === 2, 'a smaller cells-per-room gives a smaller box');
});
