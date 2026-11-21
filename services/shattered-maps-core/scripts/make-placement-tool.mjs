#!/usr/bin/env node
/**
 * Makes the owner's placement tool: one self-contained HTML page per level (the world, or one continent) that shows the realistic world picture with a
 * coordinate grid and every place as a labelled token to drag where it belongs. The saved JSON (the owner's placements) is the ground truth for the world
 * and continent pictures: it can seed a layout and score one. Areas and their rooms stay grids; only the world and the continents are placed this way.
 *
 *   pnpm --filter @shatteredarchive/shattered-maps-core build
 *   node services/shattered-maps-core/scripts/make-placement-tool.mjs --in <audited-map.json> --image <world.webp> --all <folder>
 *   node services/shattered-maps-core/scripts/make-placement-tool.mjs --in <audited-map.json> --image <world.webp> --level continent --continent az-c411 --out <file.html>
 *
 * World level: the tokens are the continents and the named seas (the areas of the Oceans continent); the units are pixels of the world picture (600 x 480).
 * Continent level: the tokens are the continent's areas; Arkane is measured in rooms east and south of its port (the owner's way of speaking about it), the
 * other continents in pixels of the world picture. Optional `--guesses <json>` ({ "<id or name>": [x, y] }) gives starting positions; without it the built-in
 * guesses for the world and for Arkane are used. The output path may not contain a `wwwroot` segment (it names areas; it is the owner's working file).
 */
/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WORLD_IMAGE = { name: 'world.webp', w: 600, h: 480 };
const OCEANS = 'az-c414';
const SKIP = new Set(['az-unsorted']);

/** Where each continent lies on the world picture (its bounding box plus a margin), and how it is measured. Arkane is measured from its port, in rooms. */
const PX = { name: 'pixels of the world picture', from: 'of the picture corner', origin: { px: [0, 0], label: '' }, scale: [1, 1] };
export const FRAMES = {
  world: { ...PX, crop: { x: 0, y: 0, w: 600, h: 480 }, zoom: 2.5, grid: { step: 20, major: 100 } },
  'az-c411': { name: 'rooms', from: 'of the port', origin: { px: [262, 200], label: 'The Arkania Port', areaId: 'az-a159' }, scale: [4.0, 3.9], crop: { x: 230, y: 95, w: 245, h: 250 }, zoom: 6, grid: { step: 5, major: 10 } },
  'az-c409': { ...PX, crop: { x: 0, y: 68, w: 220, h: 287 }, zoom: 5, grid: { step: 10, major: 50 } },
  'az-c410': { ...PX, crop: { x: 65, y: 0, w: 340, h: 168 }, zoom: 4.4, grid: { step: 10, major: 50 } },
  'az-c412': { ...PX, crop: { x: 130, y: 265, w: 270, h: 195 }, zoom: 5.5, grid: { step: 10, major: 50 } },
  'az-c415': { ...PX, crop: { x: 435, y: 105, w: 165, h: 345 }, zoom: 4.4, grid: { step: 10, major: 50 } },
};

/** Starting positions (by name) taken from the owner's descriptions and the walks; every one is a guess until the owner moves it. */
export const GUESSES = {
  world: {
    Althainia: [105, 210], Icewall: [240, 80], Arkane: [355, 225], Tropica: [265, 365], Shokono: [520, 280],
    'Arsataw Yaa': [232, 258], "Beleg'luin Aelin": [212, 168], "Sh'lanira Belian": [440, 178], 'Tirixin Belian': [415, 382], 'Lutsa Rusul': [92, 383],
    "Puxnu'kiza ip Kupux": [330, 35], 'Roully Bab Binb': [300, 440],
  },
  'az-c411': {
    'Arkane Coast': [1, 0], 'Kender Forest, The': [4, 1], Arkane: [11, 0], 'Great Tree, The': [4, -6], Balifore: [2, 9], 'Enchanted Forest': [0, 7], 'Gahboom Hill': [4, 10],
    'Southlands of Arkania': [14, 11], 'Surging Flow of Viscid Muck, A': [15, -7], 'Verminasia Forest': [16, -5], 'Winterhaven Funeral Home': [17, -6], 'Rutted Hill': [22, 0],
    'Great Forest, The': [28, -1], Verminasia: [24, -17], 'Verminasia Palace': [24, -20], 'Mount Levinox': [6, -14], 'Bloodshackle Fortress': [9, -11],
    'Marauders Housing District': [11, 18], 'Arkania Roadway': [33, 0], 'Centaur Village': [34, -3], 'Mystic Crystal Fields': [36, 2], 'Amethyst Falls': [42, 2],
  },
};

const liveRooms = (area) => area.subzones.reduce((n, s) => n + s.rooms.filter((r) => r.aliasOf === undefined).length, 0);

/** The page's data for one level: the tokens, the exits between them (one entry per pair, by direction each way), and the frame. Pure. */
export function buildData(map, core, { level, continentId, guesses }) {
  const frame = FRAMES[level === 'world' ? 'world' : continentId];
  if (!frame) throw new Error(`no picture frame for ${continentId ?? level}: add one to FRAMES`);
  const own = guesses ?? GUESSES[level === 'world' ? 'world' : continentId] ?? {};
  const tokens = [];
  const tokenOf = new Map(); // area id -> token id
  if (level === 'world') {
    for (const c of map.continents) {
      if (SKIP.has(c.id)) continue;
      if (c.id === OCEANS) {
        for (const a of c.areas) { tokens.push({ id: a.id, name: a.name, rooms: liveRooms(a), kind: 'sea' }); tokenOf.set(a.id, a.id); }
      } else {
        tokens.push({ id: c.id, name: c.name, rooms: c.areas.reduce((n, a) => n + liveRooms(a), 0), kind: 'continent' });
        for (const a of c.areas) tokenOf.set(a.id, c.id);
      }
    }
  } else {
    const c = map.continents.find((x) => x.id === continentId);
    if (!c) throw new Error(`continent ${continentId} is not in the map`);
    for (const a of c.areas) { tokens.push({ id: a.id, name: a.name, rooms: liveRooms(a), kind: 'area' }); tokenOf.set(a.id, a.id); }
  }
  for (const t of tokens) { const g = own[t.id] ?? own[t.name]; if (g) t.guess = g; }
  const pairs = new Map();
  for (const l of core.areaLinksOf(map)) {
    const from = tokenOf.get(l.from), to = tokenOf.get(l.to);
    if (from === undefined || to === undefined || from === to) continue;
    const [a, b] = from < to ? [from, to] : [to, from];
    const key = `${a}\u0000${b}`;
    const e = pairs.get(key) ?? { a, b, ab: {}, ba: {} };
    const side = from === a ? e.ab : e.ba;
    side[l.dir] = (side[l.dir] ?? 0) + l.count;
    pairs.set(key, e);
  }
  const scope = level === 'world' ? { level, id: 'world', name: 'World' } : { level, id: continentId, name: map.continents.find((c) => c.id === continentId).name };
  return {
    scope,
    frame: {
      crop: frame.crop, zoom: frame.zoom, grid: frame.grid,
      port: { px: frame.origin.px, label: frame.origin.label, areaId: frame.origin.areaId ?? null },
      sx: frame.scale[0], sy: frame.scale[1],
      units: { name: frame.name, from: frame.from },
    },
    areas: tokens,
    links: [...pairs.values()],
  };
}

/** The page: the template with its data and the picture filled in (the picture is embedded, so the file works from a folder with no server). */
export function render(template, data, imageBase64) {
  const json = JSON.stringify({ ...data, frame: { ...data.frame, image: { name: WORLD_IMAGE.name, href: `data:image/webp;base64,${imageBase64}`, w: WORLD_IMAGE.w, h: WORLD_IMAGE.h } } }).replace(/</g, '\\u003c');
  return template.split('__TITLE__').join(data.scope.name.replace(/[<>&"]/g, '')).replace('__DATA__', () => json);
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!['--in', '--image', '--out', '--all', '--level', '--continent', '--guesses'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    const value = argv[(i += 1)];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    args[arg.slice(2)] = value;
  }
  for (const needed of ['in', 'image']) if (!args[needed]) throw new Error(`--${needed} is required`);
  if (!args.all && !args.out) throw new Error('give --all <folder> or --out <file>');
  if (args.all && args.out) throw new Error('--all and --out are alternatives');
  if (args.out && !['world', 'continent'].includes(args.level)) throw new Error('--level must be world or continent');
  if (args.out && args.level === 'continent' && !args.continent) throw new Error('--level continent needs --continent <id>');
  for (const p of [args.out, args.all]) if (p && path.resolve(p).split(/[\\/]/).some((s) => s.toLowerCase() === 'wwwroot')) throw new Error('the output may not be under a wwwroot folder: it is the owner\'s working file');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distEntry = path.join(here, '..', 'dist', 'index.js');
  if (!fs.existsSync(distEntry)) throw new Error('the package is not built: run `pnpm --filter @shatteredarchive/shattered-maps-core build` first');
  const core = await import(pathToFileURL(distEntry).href);
  const map = JSON.parse(fs.readFileSync(path.resolve(args.in), 'utf8'));
  const template = fs.readFileSync(path.join(here, 'placement-tool.template.html'), 'utf8');
  const image = fs.readFileSync(path.resolve(args.image)).toString('base64');
  const guesses = args.guesses ? JSON.parse(fs.readFileSync(path.resolve(args.guesses), 'utf8')) : undefined;
  const jobs = args.all
    ? [{ level: 'world', file: path.join(args.all, 'placement-world.html') }, ...Object.keys(FRAMES).filter((k) => k !== 'world').map((id) => ({ level: 'continent', continentId: id, file: path.join(args.all, `placement-${map.continents.find((c) => c.id === id)?.name.toLowerCase() ?? id}.html`) }))]
    : [{ level: args.level, continentId: args.continent, file: args.out }];
  for (const job of jobs) {
    const data = buildData(map, core, { level: job.level, continentId: job.continentId, guesses });
    fs.mkdirSync(path.dirname(path.resolve(job.file)), { recursive: true });
    fs.writeFileSync(path.resolve(job.file), render(template, data, image), 'utf8');
    console.log(`${job.file}: ${data.areas.length} places (${data.areas.filter((a) => a.guess).length} with a starting guess), ${data.links.length} linked pairs`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`make-placement-tool: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
