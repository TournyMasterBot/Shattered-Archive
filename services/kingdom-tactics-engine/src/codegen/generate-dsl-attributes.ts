/**
 * DEV-TIME DISTILLATION SCRIPT — not shipped (see tsconfig `exclude`). Distills the
 * canonical *attributes* behind each mortal race and class from the C# source of
 * truth in `Server.Dsl/Races/*.cs` and `Server.Dsl/Classes/*.cs`, emitting
 * `src/data/dsl/race-attributes.ts` and `src/data/dsl/class-attributes.ts`.
 *
 * Run:  pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen:attrs
 * Override source root with DSL_SERVER_DSL_PATH.
 *
 * Only high-confidence, literal fields are extracted; anything computed/complex is
 * emitted as null/[] (a TODO for later phases). Remort attributes are NOT here —
 * remort races live only in the enum and are captured (with resists/alignment) in
 * the curated `races.ts` REMORT_RACES. Deeper ability wiring (ClassAbilityGroups,
 * full Spells/Songs semantics) is a Phase 2–3 concern.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectsRoot = resolve(scriptDir, '../../../../..'); // -> C:\Projects
const serverDslRoot =
  process.env.DSL_SERVER_DSL_PATH ?? join(projectsRoot, 'DSL/Server/Server.Dsl');
const racesDir = join(serverDslRoot, 'Races');
const classesDir = join(serverDslRoot, 'Classes');
const outDir = resolve(scriptDir, '../data/dsl');

// ---------------------------------------------------------------------------
// Small extraction helpers
// ---------------------------------------------------------------------------

/**
 * First `int` for a property, whether written as an expression body (`=> 10`), a
 * getter block (`{ get { return 10; } }`), or a constructor assignment (`= 10`).
 * Bounded lazy scan so we don't wander into the next member.
 */
function propInt(src: string, prop: string): number | null {
  const re = new RegExp(`${prop}\\b[\\s\\S]{0,80}?(?:=>\\s*(-?\\d+)|return\\s+(-?\\d+)|=\\s*(-?\\d+))`);
  const m = re.exec(src);
  if (!m) return null;
  return Number(m[1] ?? m[2] ?? m[3]);
}

/** First bool for a property (expression body / getter block / assignment). */
function propBool(src: string, prop: string): boolean | null {
  const re = new RegExp(`${prop}\\b[\\s\\S]{0,80}?(?:=>\\s*(true|false)|return\\s+(true|false)|=\\s*(true|false))`);
  const m = re.exec(src);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3]) === 'true';
}

/** Balanced `{ ... }` block immediately following the first `marker` match. */
function blockAfter(src: string, marker: RegExp): string | null {
  const m = marker.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index + m[0].length - 1);
  if (i < 0) return null;
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null;
}

function collect(src: string, re: RegExp, group = 1): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(src)) !== null) out.push(m[group]);
  return out;
}

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

function header(source: string): string {
  return `// @generated from ${source} — do not edit by hand.\n// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen:attrs\n`;
}

function serialize(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(serialize).join(', ')}]`;
  if (typeof v === 'object') {
    return `{ ${Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${serialize(val)}`)
      .join(', ')} }`;
  }
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  return String(v);
}

function emitTable(name: string, iface: string, rows: readonly unknown[]): string {
  return `export const ${name} = [\n${rows.map((r) => `  ${serialize(r)},`).join('\n')}\n] as const satisfies readonly ${iface}[];\n`;
}

function write(file: string, contents: string): void {
  writeFileSync(join(outDir, file), contents, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`  wrote ${file}`);
}

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

interface RaceAttributes {
  key: string;
  baseStats: { str: number; int: number; wis: number; dex: number; con: number } | null;
  primaryAttributeModifier: number | null;
  secondaryAttributeModifier: number | null;
  baseCpModifier: number | null;
  isLargeRace: boolean | null;
  isLimitedRace: boolean | null;
  resistances: string[];
  vulnerabilities: string[];
  classAffinities: { classKey: string; bonus: number }[];
}

function parseRace(src: string): RaceAttributes | null {
  const keyM = /return\s+Constants\.MortalRaces\.(\w+)/.exec(src) ?? /MortalRaces\.(\w+)/.exec(src);
  if (!keyM) return null;
  const statsM = /new\s+Stats\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/.exec(src);
  const resBlock = blockAfter(src, /\bResistances\b/) ?? '';
  const vulBlock = blockAfter(src, /\bVulnerabilities\b/) ?? '';
  const affinities = [...src.matchAll(/new\s+IClassBoost\(\s*(\w+)\.Instance\s*,\s*(-?\d+)/g)].map((m) => ({
    classKey: m[1],
    bonus: Number(m[2]),
  }));
  return {
    key: keyM[1],
    baseStats: statsM
      ? { str: +statsM[1], int: +statsM[2], wis: +statsM[3], dex: +statsM[4], con: +statsM[5] }
      : null,
    primaryAttributeModifier: propInt(src, 'PrimaryAttributeModifier'),
    secondaryAttributeModifier: propInt(src, 'SecondaryAttributeModifier'),
    baseCpModifier: propInt(src, 'BaseCpModifier'),
    isLargeRace: propBool(src, 'IsLargeRace'),
    isLimitedRace: propBool(src, 'IsLimitedRace'),
    resistances: collect(resBlock, /DslDamageType\.(\w+)/g),
    vulnerabilities: collect(vulBlock, /DslDamageType\.(\w+)/g),
    classAffinities: affinities,
  };
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

interface ClassAbilityRef {
  key: string;
  level: number;
  kind: 'skill' | 'spell' | 'song';
}
interface ClassAttributes {
  key: string;
  name: string | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  armorType: string | null;
  isReclass: boolean;
  isCSR: boolean;
  classGroup: string | null;
  castsAtLevel: boolean | null;
  castingLevelModifier: number | null;
  raceRestrictions: string[];
  abilities: ClassAbilityRef[];
}

function parseAbilityDict(src: string, marker: RegExp, kind: ClassAbilityRef['kind']): ClassAbilityRef[] {
  const block = blockAfter(src, marker);
  if (!block) return [];
  return [...block.matchAll(/\{\s*(?:new\s+)?(\w+)\s*(?:\.Instance|\(\s*\))\s*,\s*(\d+)\s*\}/g)].map((m) => ({
    key: m[1],
    level: Number(m[2]),
    kind,
  }));
}

function parseClass(src: string, file: string): ClassAttributes | null {
  const nameM = /\bName\s*=\s*"([^"]+)"/.exec(src);
  if (!nameM) return null; // not a concrete class file (interface/base/helper)
  // Every concrete class must consistently assign its MortalClass. If one doesn't,
  // that's a source inconsistency to fix upstream — surface it, don't work around it.
  const keyM = /MortalClass\s*=\s*(?:Constants\.)?MortalClass\.(\w+)\s*;/.exec(src);
  if (!keyM) {
    throw new Error(
      `${file}: concrete class "${nameM[1]}" is missing a "MortalClass = MortalClass.<X>;" ` +
        `assignment. Fix the DSL source to match its siblings (see Warrior.cs).`,
    );
  }
  const key = keyM[1];
  const primM = /PrimaryAttribute\s*=\s*(?:Constants\.)?StatAttributes\.(\w+)/.exec(src);
  const secM = /SecondaryAttribute\s*=\s*(?:Constants\.)?StatAttributes\.(\w+)/.exec(src);
  const armM = /ArmorType\s*=\s*(?:Constants\.)?DslArmorType\.(\w+)/.exec(src);
  const cgStr = /ClassGroup\s*=\s*"([^"]+)"/.exec(src);
  const cgEnum = /ClassGroup\s*=\s*(?:Constants\.)?MortalClass\.(\w+)\.ToString/.exec(src);
  const castMod = /CastingLevelModifier\s*=\s*([\d.]+)f?/.exec(src);
  const rrBlock = blockAfter(src, /RaceRestrictions\s*=\s*new\s+Constants\.MortalRaces\[\]/) ?? '';
  return {
    key,
    name: nameM ? nameM[1] : null,
    primaryAttribute: primM ? primM[1] : null,
    secondaryAttribute: secM ? secM[1] : null,
    armorType: armM ? armM[1] : null,
    isReclass: propBool(src, 'IsRecass') === true || propBool(src, 'IsReclass') === true,
    isCSR: propBool(src, 'IsCSR') === true,
    classGroup: cgStr ? cgStr[1] : cgEnum ? cgEnum[1] : null,
    castsAtLevel: propBool(src, 'CastsAtLevel'),
    castingLevelModifier: castMod ? Number(castMod[1]) : null,
    raceRestrictions: collect(rrBlock, /MortalRaces\.(\w+)/g),
    abilities: [
      ...parseAbilityDict(src, /\bSkills\s*=\s*new\s+Dictionary/, 'skill'),
      ...parseAbilityDict(src, /\bSpells\s*=\s*new\s+Dictionary/, 'spell'),
      ...parseAbilityDict(src, /\bSongs\s*=\s*new\s+Dictionary/, 'song'),
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Races
  const races: RaceAttributes[] = [];
  for (const f of readdirSync(racesDir).filter((f) => f.endsWith('.cs') && !f.startsWith('IMortalRace'))) {
    const parsed = parseRace(readFileSync(join(racesDir, f), 'utf8'));
    if (parsed) races.push(parsed);
  }
  races.sort((a, b) => a.key.localeCompare(b.key));

  const raceIface =
    `export interface RaceAttributes {\n` +
    `  readonly key: string;\n` +
    `  readonly baseStats: { readonly str: number; readonly int: number; readonly wis: number; readonly dex: number; readonly con: number } | null;\n` +
    `  readonly primaryAttributeModifier: number | null;\n` +
    `  readonly secondaryAttributeModifier: number | null;\n` +
    `  readonly baseCpModifier: number | null;\n` +
    `  readonly isLargeRace: boolean | null;\n` +
    `  readonly isLimitedRace: boolean | null;\n` +
    `  readonly resistances: readonly string[];\n` +
    `  readonly vulnerabilities: readonly string[];\n` +
    `  readonly classAffinities: readonly { readonly classKey: string; readonly bonus: number }[];\n` +
    `}\n\n`;
  write(
    'race-attributes.ts',
    header('Server.Dsl/Races/*.cs') + '\n' + raceIface +
      emitTable('RACE_ATTRIBUTES', 'RaceAttributes', races) +
      `export type RaceAttributeKey = (typeof RACE_ATTRIBUTES)[number]['key'];\n`,
  );

  // Classes
  const classes: ClassAttributes[] = [];
  for (const f of readdirSync(classesDir).filter((f) => f.endsWith('.cs'))) {
    const parsed = parseClass(readFileSync(join(classesDir, f), 'utf8'), f);
    if (parsed) classes.push(parsed);
  }
  classes.sort((a, b) => a.key.localeCompare(b.key));

  const classIface =
    `export type AbilityKind = 'skill' | 'spell' | 'song';\n` +
    `export interface ClassAbilityRef { readonly key: string; readonly level: number; readonly kind: AbilityKind; }\n` +
    `export interface ClassAttributes {\n` +
    `  readonly key: string;\n` +
    `  readonly name: string | null;\n` +
    `  readonly primaryAttribute: string | null;\n` +
    `  readonly secondaryAttribute: string | null;\n` +
    `  readonly armorType: string | null;\n` +
    `  readonly isReclass: boolean;\n` +
    `  readonly isCSR: boolean;\n` +
    `  readonly classGroup: string | null;\n` +
    `  readonly castsAtLevel: boolean | null;\n` +
    `  readonly castingLevelModifier: number | null;\n` +
    `  readonly raceRestrictions: readonly string[];\n` +
    `  readonly abilities: readonly ClassAbilityRef[];\n` +
    `}\n\n`;
  write(
    'class-attributes.ts',
    header('Server.Dsl/Classes/*.cs') + '\n' + classIface +
      emitTable('CLASS_ATTRIBUTES', 'ClassAttributes', classes) +
      `export type ClassAttributeKey = (typeof CLASS_ATTRIBUTES)[number]['key'];\n`,
  );

  console.log(`Distilled ${races.length} races, ${classes.length} classes.`);
}

main();
