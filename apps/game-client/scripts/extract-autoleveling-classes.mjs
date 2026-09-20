// apps/game-client/scripts/extract-autoleveling-classes.mjs
//
// Regenerates the web-server OFFLINE FALLBACK for GET /maps/autoleveling/classes.
//
// Unlike the areas extractor (which regex-parses the C# source), the class +
// ability-group graph is far cheaper to just SNAPSHOT from a running service —
// the C# side (Server.Dsl/Cache/AutoPilotClassCache.cs) already resolves the
// IAbilityGroup membership. Point this at any host that serves the endpoint:
//
//   pnpm --filter game-client extract:autoleveling-classes
//   AUTOLEVELING_CLASSES_URL=https://<dsl-host>/maps/autoleveling/classes pnpm --filter game-client extract:autoleveling-classes
//
// Default URL is the local web-server proxy (:41000). If the fetch fails the
// existing classes.json is left untouched (it already ships a hand-authored
// 4-base-class fallback) and the script exits 0 with a warning — re-run it once
// the C# endpoint is deployed for the full snapshot.
//
// Output: apps/web-server/src/offline/autoleveling/classes.json  ->  { classes: AutoPilotClass[] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(HERE, '../../../apps/web-server/src/offline/autoleveling/classes.json');
const URL =
  process.env.AUTOLEVELING_CLASSES_URL ||
  process.env.AUTOLEVELING_CLASSES_URL_LOCAL ||
  'http://localhost:41000/maps/autoleveling/classes';

const ABILITY_TYPES = new Set(['skill', 'spell', 'song']);

function coerceAbility(a) {
  if (!a || typeof a !== 'object') return null;
  const name = String(a.name ?? '').trim();
  if (!name) return null;
  const type = ABILITY_TYPES.has(a.type) ? a.type : 'skill';
  const level = Number.isFinite(a.level) ? Math.max(0, Math.floor(a.level)) : 0;
  const groups = Array.isArray(a.groups)
    ? a.groups
        .filter((g) => typeof g === 'string' && g.trim())
        .filter((g) => !/(Basics|Default)$/i.test(g.trim()) && g.trim().toLowerCase() !== 'none')
    : [];
  return { name, type, level, groups };
}

function coerceClass(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name ?? '').trim();
  if (!name) return null;
  const abilities = Array.isArray(c.abilities) ? c.abilities.map(coerceAbility).filter(Boolean) : [];
  return {
    name,
    mortalClass: Number.isFinite(c.mortalClass) ? c.mortalClass : 0,
    isReclass: !!c.isReclass,
    classGroup: String(c.classGroup ?? '').trim(),
    abilities,
  };
}

async function main() {
  let json;
  try {
    const res = await fetch(URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    console.warn(
      `[extract:autoleveling-classes] could not reach ${URL} (${err.message}). ` +
        `Leaving ${path.relative(process.cwd(), OUT_FILE)} as-is (hand-authored fallback). ` +
        `Re-run with AUTOLEVELING_CLASSES_URL pointed at the deployed DSL service.`,
    );
    process.exit(0);
  }

  const classes = Array.isArray(json?.classes) ? json.classes.map(coerceClass).filter(Boolean) : [];
  if (classes.length === 0) {
    console.warn('[extract:autoleveling-classes] endpoint returned no classes — leaving the fallback in place.');
    process.exit(0);
  }

  classes.sort((a, b) => Number(a.isReclass) - Number(b.isReclass) || a.name.localeCompare(b.name));

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ classes }, null, 2) + '\n');

  const abilityCount = classes.reduce((n, c) => n + c.abilities.length, 0);
  console.log(
    `[extract:autoleveling-classes] wrote ${classes.length} classes / ${abilityCount} abilities -> ` +
      path.relative(process.cwd(), OUT_FILE),
  );
}

main();
