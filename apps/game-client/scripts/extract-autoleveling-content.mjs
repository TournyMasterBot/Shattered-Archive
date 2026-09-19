// apps/game-client/scripts/extract-autoleveling-content.mjs
//
// Generates the web-server OFFLINE FALLBACK for GET /maps/autoleveling/areas by
// reading the DSL C# server source. The live endpoint is served by
// Server.Dsl/Cache/AutoPilotCache.cs; this script mirrors its logic so the
// fallback shape matches. Run it whenever the C# autopilot data changes.
//
//   pnpm --filter game-client extract:autoleveling-content
//   DSL_SERVER_ROOT=/path/to/DSL/Server/Server.Dsl node scripts/extract-autoleveling-content.mjs
//
// Output: apps/web-server/src/offline/autoleveling/areas.json  ->  { areas: AutoPilotArea[] }
//
// Sources per area:
//   <root>/Areas/<Continent>/<Area>.cs        -> AutoPilotLevel blob, Recommended*Level, Notes, AreaFlags, Map(...) approach
//   <root>/Beastiary/<Continent>/<Folder>/*.cs -> per-mob LookName / FirstKeyword / Keywords / Level (fuzzy folder match)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(HERE, '../../../apps/web-server/src/offline/autoleveling/areas.json');
const DSL_ROOT = process.env.DSL_SERVER_ROOT || 'C:/Projects/DSL/Server/Server.Dsl';

/* ------------------------------- helpers ------------------------------- */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const slugify = (s) =>
  String(s ?? 'area').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'area';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.cs')) out.push(p);
  }
  return out;
}

/* ------------------------------- C# parsing ------------------------------- */

function scalarField(src, field) {
  const str = src.match(new RegExp(`\\b${field}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (str) return str[1];
  const num = src.match(new RegExp(`\\b${field}\\s*=\\s*(-?\\d+)\\s*;`));
  if (num) return Number(num[1]);
  return null;
}

function stringArrayField(src, field) {
  const m = src.match(new RegExp(`\\b${field}\\s*=\\s*new\\s+string\\[\\]\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
}

/** Extract & JSON.parse the C# verbatim string in `JsonConvert.DeserializeObject<dynamic>(@"...")`. */
function extractAutoPilotJson(src) {
  const anchor = src.indexOf('AutoPilotLevel');
  if (anchor < 0) return null;
  const at = src.indexOf('@"', anchor);
  if (at < 0) return null;
  let i = at + 2;
  let out = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      if (src[i + 1] === '"') { out += '"'; i += 2; continue; }
      break;
    }
    out += c;
    i++;
  }
  // area files that use the AreaBase default template have a `{{AREAID}}` placeholder
  out = out.replace(/\{\{AREAID\}\}/g, 'AREA');
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function innerBlock(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const keys = Object.keys(parsed);
  if (keys.length === 1 && parsed[keys[0]] && typeof parsed[keys[0]] === 'object') return parsed[keys[0]];
  return parsed;
}

function actionList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(';').map((s) => s.trim()).filter(Boolean);
  return [];
}

function routeDirs(ap) {
  const raw = Array.isArray(ap?.dirs) && ap.dirs.length ? ap.dirs : ap?.autopilot_directions;
  return actionList(raw).flatMap((step) => step.split(/[;,]/).map((s) => s.trim()).filter(Boolean));
}

/** Recall -> area approach speedwalk from `Map = new AreaMapBase(... new ActionMove("e", 5) ...)`. */
function approachFromMap(src) {
  const anchor = src.indexOf('new AreaMapBase');
  if (anchor < 0) return [];
  const brace = src.indexOf('{', src.indexOf('IAction[]', anchor));
  const end = src.indexOf('}', brace);
  if (brace < 0 || end < 0) return [];
  const out = [];
  for (const m of src.slice(brace + 1, end).matchAll(/new\s+Action(?:Move|Swim|Run)\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g)) {
    const n = Math.max(1, Number(m[2]) || 1);
    for (let i = 0; i < n; i++) out.push(m[1].trim());
  }
  return out;
}

/* ------------------------------- Beastiary ------------------------------- */

let beastiaryIndex = null;
function loadBeastiary() {
  if (beastiaryIndex) return beastiaryIndex;
  beastiaryIndex = new Map(); // normalized folder name -> targets[]
  const root = path.join(DSL_ROOT, 'Beastiary');
  if (!fs.existsSync(root)) return beastiaryIndex;
  for (const continent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!continent.isDirectory()) continue;
    for (const areaDir of fs.readdirSync(path.join(root, continent.name), { withFileTypes: true })) {
      if (!areaDir.isDirectory()) continue;
      const key = norm(areaDir.name);
      const list = beastiaryIndex.get(key) ?? [];
      for (const file of fs.readdirSync(path.join(root, continent.name, areaDir.name))) {
        if (!file.endsWith('.cs')) continue;
        const s = fs.readFileSync(path.join(root, continent.name, areaDir.name, file), 'utf8');
        const lookName = scalarField(s, 'LookName') || scalarField(s, 'Name');
        if (!lookName || typeof lookName !== 'string') continue;
        const kw = stringArrayField(s, 'Keywords');
        const first = scalarField(s, 'FirstKeyword');
        const level = scalarField(s, 'Level');
        list.push({
          lookName: squash(lookName),
          engageName: squash((Array.isArray(kw) && kw[0]) || (typeof first === 'string' && first) || lookName),
          ...(typeof level === 'number' && level > 0 ? { level } : {}),
        });
      }
      beastiaryIndex.set(key, list);
    }
  }
  return beastiaryIndex;
}

function mobEntryToTarget(m) {
  if (!m || typeof m !== 'object') return null;
  const lookName = m.scanTarget ?? m.look ?? m.lookName;
  const engageName = m.target ?? m.engage ?? m.engageName ?? m.keyword;
  if (!lookName || !engageName) return null;
  return { lookName: squash(lookName), engageName: squash(engageName) };
}

function dedupe(targets) {
  const seen = new Set();
  const out = [];
  for (const t of targets) {
    const k = t.lookName.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.sort((a, b) => (a.level ?? 999) - (b.level ?? 999));
}

/* --------------------------------- main --------------------------------- */

function main() {
  if (!fs.existsSync(DSL_ROOT)) {
    console.error(`DSL server root not found: ${DSL_ROOT}\nSet DSL_SERVER_ROOT to override.`);
    process.exit(1);
  }
  const beasts = loadBeastiary();
  const areasRoot = path.join(DSL_ROOT, 'Areas');
  const areas = [];
  let scanned = 0;

  for (const file of walk(areasRoot)) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('AutoPilotLevel')) continue;
    scanned++;

    const areaName = scalarField(src, 'AreaName');
    if (!areaName || typeof areaName !== 'string' || areaName === 'Not Specified') continue;

    const ap = innerBlock(extractAutoPilotJson(src)) || {};
    const dirs = routeDirs(ap);
    if (dirs.length === 0) continue;

    const areaId = path.basename(file, '.cs');
    const continent = path.basename(path.dirname(file));
    const min = scalarField(src, 'RecommendedMinimumLevel');
    const max = scalarField(src, 'RecommendedMaximumLevel');
    const flags = src.match(/AreaFlags\s*=\s*([^;]+);/)?.[1] ?? '';

    let startRoom = squash(ap.autopilot_start_room);
    if (/^undefined start room$/i.test(startRoom)) startRoom = '';

    let speedwalk = actionList(ap.speedwalk_to_start_room);
    if (speedwalk.length === 0) speedwalk = approachFromMap(src);

    const fileMobs = [
      ...(Array.isArray(ap.secondary_mobs) ? ap.secondary_mobs : []),
      ...(Array.isArray(ap.allowed_mobs) ? ap.allowed_mobs : []),
    ]
      .map(mobEntryToTarget)
      .filter(Boolean);

    const targets =
      fileMobs.length > 0 ? dedupe(fileMobs) : dedupe(beasts.get(norm(areaId)) ?? []);

    areas.push({
      slug: slugify(areaName),
      areaName,
      continent,
      areaId,
      levelRange: [typeof min === 'number' && min > 0 ? min : 1, typeof max === 'number' && max > 0 ? max : 51],
      startRoom,
      speedwalkToStart: speedwalk.join(';'),
      requiredActions: actionList(ap.area_required_actions),
      dirs,
      notes: String(scalarField(src, 'Notes') || '').replace(/\\n/g, '\n').trim(),
      isExcellentLevelingArea: /IsExcellentLevelingArea/.test(flags),
      recommendedTargets: targets,
    });
  }

  areas.sort((a, b) => a.levelRange[0] - b.levelRange[0] || a.areaName.localeCompare(b.areaName));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ areas }, null, 2) + '\n');

  const withTargets = areas.filter((a) => a.recommendedTargets.length > 0).length;
  console.log(`Scanned ${scanned} area files with AutoPilotLevel; ${areas.length} have a route.`);
  console.log(`${withTargets}/${areas.length} have recommended targets.`);
  console.log(`-> ${path.relative(process.cwd(), OUT_FILE)}`);
  for (const fav of ['new-mudschool', 'centaur-village', 'amethyst-falls', 'gahboom-hill', 'gahboom-factory', 'glonnoil-fjord', 'algoron-threadworks', 'within-the-great-tree']) {
    const a = areas.find((x) => x.slug === fav);
    console.log(
      `  ${fav.padEnd(22)} ${a ? `L${a.levelRange[0]}-${a.levelRange[1]}  dirs:${a.dirs.length}  targets:${a.recommendedTargets.length}` : 'MISSING (no route in C# source)'}`,
    );
  }
}

main();
