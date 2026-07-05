/**
 * DEV-TIME DISTILLATION SCRIPT — not part of the shipped build (see tsconfig
 * `exclude`). Reads the C# source of truth (`Server.Core/Constants.cs`) and emits
 * `src/data/dsl/*.ts` as generated, checked-in TypeScript. The game NEVER references
 * the .cs at runtime — only these distilled files.
 *
 * Run:  pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen
 * Override source path with DSL_CONSTANTS_PATH.
 *
 * Identity (id/key/name) comes verbatim from Constants.cs. A few *classifications*
 * that live in code comments / lore rather than the enum body (remort dragon
 * families + alignment, god alignment groups, kingdom-vs-clan) are curated in the
 * tables below and confirmed with the project owner; re-running preserves them.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectsRoot = resolve(scriptDir, '../../../../..'); // -> C:\Projects
const constantsPath =
  process.env.DSL_CONSTANTS_PATH ?? join(projectsRoot, 'DSL/Server/Server.Core/Constants.cs');
const outDir = resolve(scriptDir, '../data/dsl');

const SKIP_KEYS = new Set(['Unknown', 'None', 'NA', 'Undefined', 'Undetermined']);

interface EnumEntry {
  key: string;
  name: string;
  value: number;
}

// ---------------------------------------------------------------------------
// C# enum parsing
// ---------------------------------------------------------------------------

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (and XML /** */)
    .replace(/\/\/.*$/gm, ''); // line + /// doc comments
}

/** Extract the body between the braces of `enum <Name> { ... }`. */
function extractEnumBlock(src: string, name: string): string {
  const re = new RegExp(`enum\\s+${name}\\s*\\{`);
  const m = re.exec(src);
  if (!m) throw new Error(`enum ${name} not found in ${constantsPath}`);
  let i = m.index + m[0].length;
  const start = i;
  let depth = 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    if (depth === 0) return src.slice(start, i);
  }
  throw new Error(`Unterminated enum ${name}`);
}

/** Evaluate a C# enum value expression: decimal, hex, or `a << b`. */
function evalValue(expr: string | undefined, prev: number): number {
  if (expr === undefined || expr.trim() === '') return prev + 1;
  const t = expr.trim();
  const shift = /^(\d+)\s*<<\s*(\d+)$/.exec(t);
  if (shift) return Number(shift[1]) << Number(shift[2]);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^-?\d+$/.test(t)) return Number(t);
  throw new Error(`Cannot evaluate enum value expression: "${expr}"`);
}

function parseEnum(src: string, name: string): EnumEntry[] {
  const block = stripComments(extractEnumBlock(src, name));
  const entries: EnumEntry[] = [];
  let prev = -1;
  for (const rawPiece of block.split(',')) {
    const descM = /\[Description\("((?:\\.|[^"\\])*)"\)\]/.exec(rawPiece);
    const desc = descM ? descM[1].replace(/\\"/g, '"') : undefined;
    const withoutAttrs = rawPiece.replace(/\[[^\]]*\]/g, '').trim();
    if (!withoutAttrs) continue;
    const m = /^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/.exec(withoutAttrs);
    if (!m) continue;
    const key = m[1];
    const value = evalValue(m[2], prev);
    prev = value;
    if (SKIP_KEYS.has(key)) continue;
    entries.push({ key, name: desc && desc.length > 0 ? desc : key, value });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Curated classifications (comments/lore, not enum bodies — confirmed with owner)
// ---------------------------------------------------------------------------

const MORTAL_CATEGORY: Record<string, string> = {
  Human: 'Human',
  ShalonestiElf: 'Elf', DarkElf: 'Elf', WildElf: 'Elf', SeaElf: 'Elf', HalfElf: 'Elf',
  MountainDwarf: 'Dwarf', HillDwarf: 'Dwarf', DarkDwarf: 'Dwarf', Mul: 'Dwarf',
  Minotaur: 'Minotaur',
  Ogre: 'Ogre', GiantOgre: 'Ogre', HalfOgre: 'Ogre',
  Yinn: 'Yinn',
  Goblin: 'Goblin', HobGoblin: 'Goblin', Bugbear: 'Goblin',
  TinkerGnome: 'Gnome', DeepGnome: 'Gnome',
  Kender: 'Kender',
  Wemic: 'Leonine', Felar: 'Leonine',
  Troll: 'Limited', GullyDwarf: 'Limited', Ariel: 'Limited', Pixie: 'Limited',
  Centaur: 'Limited', Orc: 'Limited', Bakali: 'Limited',
  Arboren: 'Other', Lagoda: 'Other', Lepori: 'Other',
};

type Alignment = 'Good' | 'Neutral' | 'Evil';
interface RemortClass {
  family: string;
  alignment: Alignment;
  /** Innate dragonskin damage resists (canonical), where applicable. */
  resists?: readonly string[];
  /** Lore trait flags for later balance. */
  traits?: readonly string[];
}
const REMORT: Record<string, RemortClass> = {
  // Metallic dragons — Good
  GoldDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Fire', 'Poison'] },
  SilverDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Cold'] },
  BrassDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Charm', 'Fire'] },
  BronzeDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Lightning'] },
  CopperDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Acid'] },
  SteelDragon: { family: 'metallic-dragon', alignment: 'Good', resists: ['Physical'] },
  // Chromatic dragons — Evil
  RedDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Fire'] },
  BlackDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Acid'] },
  BlueDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Lightning'] },
  GreenDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Poison'] },
  WhiteDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Cold'] },
  BrownDragon: { family: 'chromatic-dragon', alignment: 'Evil', resists: ['Fire'] },
  // Gem dragons — Neutral
  CrystalDragon: { family: 'gem-dragon', alignment: 'Neutral', resists: ['Light', 'Harm'] },
  TopazDragon: { family: 'gem-dragon', alignment: 'Neutral', resists: ['Drain'] },
  // Angels — Good
  Archangel: { family: 'angel', alignment: 'Good' },
  LesserAngel: { family: 'angel', alignment: 'Good' },
  // Balanx — Neutral
  HeadBalanx: { family: 'balanx', alignment: 'Neutral' },
  LesserBalanx: { family: 'balanx', alignment: 'Neutral' },
  // Demons — Evil
  DemonLord: { family: 'demon', alignment: 'Evil' },
  LesserDemon: { family: 'demon', alignment: 'Evil' },
  // Giants — split by type; demigod-blooded: unlimited mana but permadeath
  FrostGiant: { family: 'giant', alignment: 'Good', traits: ['unlimited-mana', 'permadeath'] },
  CloudGiant: { family: 'giant', alignment: 'Neutral', traits: ['unlimited-mana', 'permadeath'] },
  FireGiant: { family: 'giant', alignment: 'Evil', traits: ['unlimited-mana', 'permadeath'] },
};

const GOD_GROUP: Record<string, string> = {
  Austinian: 'Good', Kantilles: 'Good', Nadrik: 'Good', Taliena: 'Good', Kadiya: 'Good', Siccara: 'Good',
  Kwainin: 'Neutral', Cliath: 'Neutral', Sebatis: 'Neutral', Zandreya: 'Neutral', Raije: 'Neutral', Turpa: 'Neutral',
  Drakkara: 'Evil', Fatale: 'Evil', Dragoth: 'Evil', Devion: 'Evil', Mencius: 'Evil', Necrucifer: 'Evil',
  Malachive: 'Chaos',
};

const ALLEGIANCE_KIND: Record<string, string> = {
  Loner: 'unaffiliated', Renegade: 'unaffiliated',
  Angel: 'remort', Demon: 'remort', Dragon: 'remort', Giant: 'remort',
  GrayChurch: 'kingdom', Verminasia: 'kingdom', Nordmaar: 'kingdom', Abaddon: 'kingdom',
  Althainia: 'kingdom', ShalonestiKingdom: 'kingdom', Ganth: 'kingdom', NewThalos: 'kingdom',
  Marauders: 'kingdom', Thaxanos: 'kingdom', Arkane: 'kingdom', Balifore: 'kingdom', Darkonin: 'kingdom',
  Knighthood: 'clan', Bloodlust: 'clan', Shadow: 'clan', Justice: 'clan', Wargar: 'clan', Conclave: 'clan',
  BlackRobe: 'clan', RedRobe: 'clan', WhiteRobe: 'clan', ShalonestiClan: 'clan', Chaos: 'clan', Slayers: 'clan',
};

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

function header(source: string): string {
  return `// @generated from ${source} — do not edit by hand.\n// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen\n`;
}

function lit(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  return String(v);
}

function emitConst(
  name: string,
  iface: string,
  fields: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const body = rows
    .map((r) => `  { ${fields.map((f) => `${f}: ${lit(r[f])}`).join(', ')} },`)
    .join('\n');
  return `export const ${name} = [\n${body}\n] as const satisfies readonly ${iface}[];\n`;
}

function write(file: string, contents: string): void {
  const path = join(outDir, file);
  writeFileSync(path, contents, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`  wrote ${file}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(outDir, { recursive: true });
  const src = readFileSync(constantsPath, 'utf8');
  console.log(`Distilling DSL identity from ${constantsPath}`);

  // moons.ts
  {
    const type = parseEnum(src, 'MoonType');
    const phase = parseEnum(src, 'MoonPhase');
    const pos = parseEnum(src, 'MoonPosition');
    const dir = parseEnum(src, 'MoonDirection');
    const out =
      header('Constants.cs (MoonType/MoonPhase/MoonPosition/MoonDirection)') +
      `\nexport interface DslNamed { readonly id: number; readonly key: string; readonly name: string; }\n\n` +
      emitConst('MOON_TYPES', 'DslNamed', ['id', 'key', 'name'], type.map(rowNamed)) +
      `export type MoonTypeKey = (typeof MOON_TYPES)[number]['key'];\n\n` +
      emitConst('MOON_PHASES', 'DslNamed', ['id', 'key', 'name'], phase.map(rowNamed)) +
      `export type MoonPhaseKey = (typeof MOON_PHASES)[number]['key'];\n\n` +
      emitConst('MOON_POSITIONS', 'DslNamed', ['id', 'key', 'name'], pos.map(rowNamed)) +
      `export type MoonPositionKey = (typeof MOON_POSITIONS)[number]['key'];\n\n` +
      emitConst('MOON_DIRECTIONS', 'DslNamed', ['id', 'key', 'name'], dir.map(rowNamed)) +
      `export type MoonDirectionKey = (typeof MOON_DIRECTIONS)[number]['key'];\n`;
    write('moons.ts', out);
  }

  // alignment.ts
  {
    const align = parseEnum(src, 'Alignment').filter((e) => e.name.length > 0);
    const stats = parseEnum(src, 'StatAttributes');
    const out =
      header('Constants.cs (Alignment, StatAttributes)') +
      `\nexport interface DslNamed { readonly id: number; readonly key: string; readonly name: string; }\n\n` +
      emitConst('ALIGNMENTS', 'DslNamed', ['id', 'key', 'name'], align.map(rowNamed)) +
      `export type AlignmentKey = (typeof ALIGNMENTS)[number]['key'];\n\n` +
      emitConst('STAT_ATTRIBUTES', 'DslNamed', ['id', 'key', 'name'], stats.map(rowNamed)) +
      `export type StatAttributeKey = (typeof STAT_ATTRIBUTES)[number]['key'];\n`;
    write('alignment.ts', out);
  }

  // terrain.ts
  {
    const terrain = parseEnum(src, 'TerrainTypes');
    const out =
      header('Constants.cs (TerrainTypes)') +
      `\nexport interface DslTerrain { readonly id: number; readonly key: string; readonly name: string; }\n\n` +
      emitConst('TERRAINS', 'DslTerrain', ['id', 'key', 'name'], terrain.map(rowNamed)) +
      `export type TerrainKey = (typeof TERRAINS)[number]['key'];\n`;
    write('terrain.ts', out);
  }

  // classes.ts (identity only; attributes/reclass flags distilled in step 3)
  {
    const classes = parseEnum(src, 'MortalClass');
    const out =
      header('Constants.cs (MortalClass)') +
      `\nexport interface DslClassId { readonly id: number; readonly key: string; readonly name: string; }\n\n` +
      emitConst('CLASSES', 'DslClassId', ['id', 'key', 'name'], classes.map(rowNamed)) +
      `export type ClassKey = (typeof CLASSES)[number]['key'];\n`;
    write('classes.ts', out);
  }

  // gods.ts
  {
    const gods = parseEnum(src, 'AffiliationGods');
    const rows = gods.map((e) => ({
      id: e.value,
      key: e.key,
      name: e.name,
      group: GOD_GROUP[e.key] ?? 'Unknown',
    }));
    const out =
      header('Constants.cs (AffiliationGods) + curated alignment groups') +
      `\nexport type GodGroup = 'Good' | 'Neutral' | 'Evil' | 'Chaos' | 'Unknown';\n` +
      `export interface DslGod { readonly id: number; readonly key: string; readonly name: string; readonly group: GodGroup; }\n\n` +
      emitConst('GODS', 'DslGod', ['id', 'key', 'name', 'group'], rows) +
      `export type GodKey = (typeof GODS)[number]['key'];\n`;
    write('gods.ts', out);
  }

  // affiliations.ts (kingdoms / clans / remort allegiances)
  {
    const all = parseEnum(src, 'AffilitionAllegiance');
    const rows = all.map((e) => ({
      id: e.value,
      key: e.key,
      name: e.name,
      kind: ALLEGIANCE_KIND[e.key] ?? 'unknown',
    }));
    const out =
      header('Constants.cs (AffilitionAllegiance) + curated kingdom/clan classification') +
      `\nexport type AffiliationKind = 'kingdom' | 'clan' | 'remort' | 'unaffiliated' | 'unknown';\n` +
      `export interface DslAffiliation { readonly id: number; readonly key: string; readonly name: string; readonly kind: AffiliationKind; }\n\n` +
      emitConst('AFFILIATIONS', 'DslAffiliation', ['id', 'key', 'name', 'kind'], rows) +
      `export type AffiliationKey = (typeof AFFILIATIONS)[number]['key'];\n` +
      `export const KINGDOMS = AFFILIATIONS.filter((a) => a.kind === 'kingdom');\n` +
      `export const CLANS = AFFILIATIONS.filter((a) => a.kind === 'clan');\n`;
    write('affiliations.ts', out);
  }

  // races.ts (mortal identity + category; remort identity + family/alignment/resists)
  {
    const mortal = parseEnum(src, 'MortalRaces');
    const remort = parseEnum(src, 'RemortRaces');
    const mortalRows = mortal.map((e) => ({
      id: e.value,
      key: e.key,
      name: e.name,
      category: MORTAL_CATEGORY[e.key] ?? 'Other',
    }));
    const remortRows = remort.map((e) => {
      const c = REMORT[e.key];
      if (!c) throw new Error(`Remort race ${e.key} missing curated classification`);
      return {
        id: e.value,
        key: e.key,
        name: e.name,
        family: c.family,
        alignment: c.alignment,
        resists: c.resists ?? [],
        traits: c.traits ?? [],
      };
    });
    const out =
      header('Constants.cs (MortalRaces, RemortRaces) + curated category/family/alignment') +
      `\nexport interface DslMortalRace { readonly id: number; readonly key: string; readonly name: string; readonly category: string; }\n` +
      `export interface DslRemortRace {\n  readonly id: number;\n  readonly key: string;\n  readonly name: string;\n  readonly family: string;\n  readonly alignment: 'Good' | 'Neutral' | 'Evil';\n  readonly resists: readonly string[];\n  readonly traits: readonly string[];\n}\n\n` +
      emitConst('MORTAL_RACES', 'DslMortalRace', ['id', 'key', 'name', 'category'], mortalRows) +
      `export type MortalRaceKey = (typeof MORTAL_RACES)[number]['key'];\n\n` +
      emitConst('REMORT_RACES', 'DslRemortRace', ['id', 'key', 'name', 'family', 'alignment', 'resists', 'traits'], remortRows) +
      `export type RemortRaceKey = (typeof REMORT_RACES)[number]['key'];\n`;
    write('races.ts', out);
  }

  console.log('DSL identity distillation complete.');
}

function rowNamed(e: EnumEntry): Record<string, unknown> {
  return { id: e.value, key: e.key, name: e.name };
}

main();
