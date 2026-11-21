import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FRAMES, GUESSES, buildData, parseArgs, render } from './make-placement-tool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'index.js');
const built = fs.existsSync(dist);

const room = (id, alias) => ({ id, title: id, exits: {}, ...(alias ? { aliasOf: alias } : {}), sources: [{ kind: 'azah', ref: id, credit: 'Azah', date: '2020-01-01' }] });
const area = (id, name, n, extra = []) => ({ id, name, placement: null, subzones: [{ id: `${id}-s`, name: 'Main', kind: 'consistent', rooms: [...Array.from({ length: n }, (_, i) => room(`${id}-r${i}`)), ...extra] }], sources: [] });
const link = (id, from, dir, to) => ({ id, from, dir, to, state: 'followed', offPage: false, sources: [] });
// two continents and the Oceans continent (az-c414); arkane has a coast and a forest, the sea touches both continents
const map = {
  version: 1,
  generatedAt: '2026-11-19',
  continents: [
    { id: 'az-c411', name: 'Arkane', areas: [area('a1', 'Arkane Coast', 3), area('a2', 'Kender Forest, The', 4, [room('alias', 'a1-r0')])] },
    { id: 'az-c409', name: 'Althainia', areas: [area('b1', 'Althainia Coast', 2)] },
    { id: 'az-c414', name: 'Oceans', areas: [area('s1', 'Arsataw Yaa', 5), area('s2', 'Unnamed Sea', 1)] },
    { id: 'az-unsorted', name: 'Unsorted', areas: [area('u1', 'Loose', 1)] },
  ],
  links: [
    link('l1', 'a1-r0', 'E', 'a2-r0'), link('l2', 'a2-r1', 'W', 'a1-r1'), link('l3', 'a1-r1', 'W', 's1-r0'), link('l4', 'b1-r0', 'E', 's1-r1'), link('l5', 'a1-r0', 'N', 'a1-r1'),
    link('l6', 'a1-r2', 'S', 'b1-r1'), link('l7', 's1-r2', 'W', 'b1-r0'),
  ],
};

test('parseArgs needs the map, the picture and an output, a level, and refuses a wwwroot output', () => {
  assert.deepEqual(parseArgs(['--in', 'm', '--image', 'i', '--all', 'out']), { in: 'm', image: 'i', all: 'out' });
  assert.equal(parseArgs(['--', '--in', 'm', '--image', 'i', '--out', 'o.html', '--level', 'continent', '--continent', 'az-c411']).continent, 'az-c411');
  assert.throws(() => parseArgs(['--image', 'i', '--all', 'o']), /--in is required/);
  assert.throws(() => parseArgs(['--in', 'm', '--all', 'o']), /--image is required/);
  assert.throws(() => parseArgs(['--in', 'm', '--image', 'i']), /give --all/);
  assert.throws(() => parseArgs(['--in', 'm', '--image', 'i', '--all', 'o', '--out', 'p']), /alternatives/);
  assert.throws(() => parseArgs(['--in', 'm', '--image', 'i', '--out', 'o', '--level', 'moon']), /world or continent/);
  assert.throws(() => parseArgs(['--in', 'm', '--image', 'i', '--out', 'o', '--level', 'continent']), /needs --continent/);
  assert.throws(() => parseArgs(['--in', 'm', '--image', 'i', '--all', 'C:/site/wwwroot/t']), /wwwroot/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--in']), /--in needs a value/);
});

test('the world level has the continents and the named seas as tokens, the exits between them, and the starting guesses', { skip: !built && 'build the core first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const data = buildData(map, core, { level: 'world' });
  assert.deepEqual(data.areas.map((a) => [a.id, a.kind, a.rooms]), [['az-c411', 'continent', 7], ['az-c409', 'continent', 2], ['s1', 'sea', 5], ['s2', 'sea', 1]]);
  assert.equal(data.areas.some((a) => a.id === 'az-unsorted' || a.id === 'az-c414'), false, 'neither Unsorted nor the Oceans continent is a token, the seas are');
  const pair = (a, b) => data.links.find((l) => l.a === a && l.b === b);
  assert.deepEqual(pair('az-c409', 'az-c411'), { a: 'az-c409', b: 'az-c411', ab: {}, ba: { S: 1 } }, 'Arkane exits south into Althainia: counted from the second token of the sorted pair');
  assert.deepEqual(pair('az-c411', 's1'), { a: 'az-c411', b: 's1', ab: { W: 1 }, ba: {} });
  assert.deepEqual(pair('az-c409', 's1'), { a: 'az-c409', b: 's1', ab: { E: 1 }, ba: { W: 1 } });
  assert.equal(data.links.some((l) => l.a === l.b), false, 'an exit inside one continent is not an exit between tokens');
  assert.deepEqual(data.scope, { level: 'world', id: 'world', name: 'World' });
  assert.deepEqual(data.frame.crop, { x: 0, y: 0, w: 600, h: 480 });
  assert.equal(data.frame.units.name, 'pixels of the world picture');
  assert.deepEqual(data.areas.find((a) => a.name === 'Arkane').guess, GUESSES.world.Arkane, 'the built-in world guesses are used when none are given');
  assert.equal(data.areas.find((a) => a.id === 's2').guess, undefined, 'a place with no guess starts in the list');
  const named = buildData(map, core, { level: 'world', guesses: { Arkane: [1, 2], s1: [3, 4] } });
  assert.deepEqual(named.areas.find((a) => a.id === 'az-c411').guess, [1, 2], 'a guess by name');
  assert.deepEqual(named.areas.find((a) => a.id === 's1').guess, [3, 4], 'a guess by id');
});

test('a continent level has its areas as tokens, only the exits among them, rooms from the port for Arkane and the picture\'s pixels for the others', { skip: !built && 'build the core first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const data = buildData(map, core, { level: 'continent', continentId: 'az-c411' });
  assert.deepEqual(data.areas.map((a) => [a.id, a.rooms]), [['a1', 3], ['a2', 4]], 'an alias room is not counted');
  assert.deepEqual(data.areas.find((a) => a.id === 'a1').guess, GUESSES['az-c411']['Arkane Coast']);
  assert.equal(data.links.length, 1, 'the exit to the sea and the exit inside one area are not exits between two areas of this continent');
  assert.deepEqual(data.links[0], { a: 'a1', b: 'a2', ab: { E: 1 }, ba: { W: 1 } }, 'the exit that points back counts the other way');
  assert.deepEqual(data.frame.port, { px: [262, 200], label: 'The Arkania Port', areaId: 'az-a159' });
  assert.equal(data.frame.units.name, 'rooms');
  assert.deepEqual(data.frame.grid, { step: 5, major: 10 });
  const other = buildData(map, core, { level: 'continent', continentId: 'az-c409' });
  assert.equal(other.frame.port.label, '');
  assert.deepEqual(other.frame.units.name, 'pixels of the world picture');
  assert.equal(other.areas[0].guess, undefined);
  assert.throws(() => buildData(map, core, { level: 'continent', continentId: 'nope' }), /no picture frame for nope/);
  assert.throws(() => buildData({ ...map, continents: [] }, core, { level: 'continent', continentId: 'az-c411' }), /is not in the map/);
  for (const id of Object.keys(FRAMES)) assert.ok(FRAMES[id].crop.w > 0 && FRAMES[id].zoom > 0, `${id} has a frame`);
});

test('the page embeds the data and the picture, and nothing in the data can end the script block', { skip: !built && 'build the core first' }, async () => {
  const core = await import(pathToFileURL(dist).href);
  const tricky = { ...map, continents: map.continents.map((c) => (c.id === 'az-c411' ? { ...c, areas: [area('a1', '</script><b>Coast', 2)] } : c)) };
  const data = buildData(tricky, core, { level: 'continent', continentId: 'az-c411' });
  const html = render('<title>__TITLE__</title><script>const DATA = __DATA__;</script>', data, 'QUJD');
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1, 'only the template\'s own closing tag');
  const json = JSON.parse(/const DATA = (.*);<\/script>/s.exec(html)[1]);
  assert.equal(json.areas[0].name, '</script><b>Coast');
  assert.equal(json.frame.image.href, 'data:image/webp;base64,QUJD');
  assert.equal(json.frame.image.w, 600);
  assert.ok(html.startsWith('<title>Arkane</title>'));
  // the real template has both slots and the drag script
  const template = fs.readFileSync(path.join(here, 'placement-tool.template.html'), 'utf8');
  assert.ok(template.includes('__DATA__') && template.includes('__TITLE__') && template.includes('pointerdown'));
});
