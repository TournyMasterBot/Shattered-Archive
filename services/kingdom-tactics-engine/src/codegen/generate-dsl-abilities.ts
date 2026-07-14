/**
 * DEV-TIME DISTILLATION SCRIPT — not part of the shipped build (see tsconfig
 * `exclude`). Reads the C# DSL ability source of truth under
 * `Server.Dsl/{Spells,Songs,Skills,ClassAbilityGroups}/*.cs` and emits
 * `src/data/dsl/abilities.ts` as generated, checked-in TypeScript. The game NEVER
 * references the .cs at runtime — only this distilled file.
 *
 * Run:  pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen
 * Override source root with DSL_ROOT (defaults to C:/Projects/DSL).
 *
 * Scope: CATALOG ONLY. The DSL ability files carry name + lore text, not mechanics —
 * so this emits structural identity (key, name, type) + class ability-group membership
 * (direct refs plus transitively-resolved `GetAbilitiesByType<G>()` group-of-groups).
 * Damage/scaling/saves/magnitudes are authored later as balance data, not here.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectsRoot = resolve(scriptDir, '../../../../..'); // -> C:\Projects
const dslRoot = process.env.DSL_ROOT ?? join(projectsRoot, 'DSL');
const dslSrc = join(dslRoot, 'Server', 'Server.Dsl');
const outDir = resolve(scriptDir, '../data/dsl');

type AbilityType = 'skill' | 'spell' | 'song';

interface AbilityRow {
  key: string; // C# class name (unique)
  name: string; // Name = "..." display string
  type: AbilityType;
}

interface GroupRow {
  key: string; // C# class name of the ability group (what GetAbilitiesByType<T> targets)
  groupName: string; // AbilityGroup enum value
  groupType: string; // GroupType enum value
  abilityKeys: readonly string[]; // transitively-resolved member ability keys
}

// Folders whose class files are ability definitions, mapped to the type their base sets.
const ABILITY_FOLDERS: ReadonlyArray<{ dir: string; type: AbilityType; base: string }> = [
  { dir: 'Spells', type: 'spell', base: 'Spell' },
  { dir: 'Songs', type: 'song', base: 'Song' },
  { dir: 'Skills', type: 'skill', base: 'Skill' },
];

const GROUP_DIR = 'ClassAbilityGroups';
const GROUP_SKIP = new Set(['IAbilityGroup', 'BaseAbilityGroup']);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function csFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.cs'))
    .map((f) => join(dir, f));
}

/** First `public class <Name>` in a file (the ability / group type name). */
function className(src: string): string | undefined {
  const m = /\bclass\s+([A-Za-z_]\w*)/.exec(src);
  return m?.[1];
}

/** First `Name = "..."` assignment (the display name). */
function abilityName(src: string): string | undefined {
  const m = /\bName\s*=\s*"((?:\\.|[^"\\])*)"/.exec(src);
  return m ? m[1].replace(/\\"/g, '"') : undefined;
}

/** Collect ability rows from the three definition folders. */
function parseAbilities(): AbilityRow[] {
  const rows: AbilityRow[] = [];
  for (const { dir, type, base } of ABILITY_FOLDERS) {
    for (const file of csFiles(join(dslSrc, dir))) {
      const src = readFileSync(file, 'utf8');
      const key = className(src);
      if (!key || key === base) continue; // skip the base Spell/Song/Skill class
      const name = abilityName(src);
      if (!name || name === base) continue; // needs a real display name
      rows.push({ key, name, type });
    }
  }
  return rows;
}

interface RawGroup {
  key: string;
  groupName: string;
  groupType: string;
  directKeys: string[]; // member ability class refs (unfiltered)
  groupRefs: string[]; // GetAbilitiesByType<G>() class refs (unfiltered)
}

/** Parse a group file into its declared name/type + raw member and group-of-group refs. */
function parseGroup(src: string, key: string): RawGroup {
  const gName = /GroupName\s*=>\s*AbilityGroup\.([A-Za-z_]\w*)/.exec(src)?.[1] ?? key;
  const gType = /GroupType\s*=>\s*GroupType\.([A-Za-z_]\w*)/.exec(src)?.[1] ?? 'Unknown';

  const directKeys = new Set<string>();
  for (const m of src.matchAll(/\bnew\s+([A-Za-z_]\w*)\s*\(/g)) directKeys.add(m[1]);
  for (const m of src.matchAll(/\b([A-Za-z_]\w*)\.Instance\b/g)) directKeys.add(m[1]);

  const groupRefs = new Set<string>();
  for (const m of src.matchAll(/GetAbilitiesByType<\s*([A-Za-z_]\w*)\s*>/g)) groupRefs.add(m[1]);

  return { key, groupName: gName, groupType: gType, directKeys: [...directKeys], groupRefs: [...groupRefs] };
}

function parseGroups(): RawGroup[] {
  const rows: RawGroup[] = [];
  for (const file of csFiles(join(dslSrc, GROUP_DIR))) {
    const src = readFileSync(file, 'utf8');
    const key = className(src);
    if (!key || GROUP_SKIP.has(key)) continue;
    rows.push(parseGroup(src, key));
  }
  return rows;
}

/**
 * Resolve each group's transitive member ability keys: direct member refs filtered to
 * known abilities, unioned with the resolved members of every referenced group. Memoized;
 * a visiting set guards against cycles.
 */
function resolveGroups(raw: RawGroup[], abilityKeys: ReadonlySet<string>): GroupRow[] {
  const byKey = new Map(raw.map((g) => [g.key, g]));
  const memo = new Map<string, Set<string>>();

  function resolve(key: string, visiting: Set<string>): Set<string> {
    const cached = memo.get(key);
    if (cached) return cached;
    const g = byKey.get(key);
    const acc = new Set<string>();
    if (!g || visiting.has(key)) return acc;
    visiting.add(key);
    for (const k of g.directKeys) if (abilityKeys.has(k)) acc.add(k);
    for (const ref of g.groupRefs) {
      if (!byKey.has(ref)) continue; // unknown group ref — skip
      for (const k of resolve(ref, visiting)) acc.add(k);
    }
    visiting.delete(key);
    memo.set(key, acc);
    return acc;
  }

  return raw
    .map((g) => ({
      key: g.key,
      groupName: g.groupName,
      groupType: g.groupType,
      abilityKeys: [...resolve(g.key, new Set())].sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function header(source: string): string {
  return `// @generated from ${source} — do not edit by hand.\n// Regenerate: pnpm --filter @shatteredarchive/kingdom-tactics-engine codegen\n`;
}

function lit(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
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

function main(): void {
  mkdirSync(outDir, { recursive: true });
  console.log(`Distilling DSL ability catalog from ${dslSrc}`);

  const abilities = parseAbilities().sort((a, b) => a.key.localeCompare(b.key));
  const abilityKeys = new Set(abilities.map((a) => a.key));
  const groups = resolveGroups(parseGroups(), abilityKeys);

  const counts = abilities.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});

  const out =
    header('Server.Dsl/{Spells,Songs,Skills,ClassAbilityGroups}/*.cs') +
    `\nexport type AbilityType = 'skill' | 'spell' | 'song';\n` +
    `export interface DslAbility { readonly key: string; readonly name: string; readonly type: AbilityType; }\n` +
    `export interface DslAbilityGroup {\n  readonly key: string;\n  readonly groupName: string;\n  readonly groupType: string;\n  readonly abilityKeys: readonly string[];\n}\n\n` +
    emitConst('ABILITIES', 'DslAbility', ['key', 'name', 'type'], abilities) +
    `export type AbilityKey = (typeof ABILITIES)[number]['key'];\n\n` +
    emitConst('ABILITY_GROUPS', 'DslAbilityGroup', ['key', 'groupName', 'groupType', 'abilityKeys'], groups) +
    `export type AbilityGroupKey = (typeof ABILITY_GROUPS)[number]['key'];\n`;

  writeFileSync(join(outDir, 'abilities.ts'), out, 'utf8');
  console.log(
    `  wrote abilities.ts — ${abilities.length} abilities (${counts.spell ?? 0} spell / ${
      counts.song ?? 0
    } song / ${counts.skill ?? 0} skill), ${groups.length} groups`,
  );
}

main();
