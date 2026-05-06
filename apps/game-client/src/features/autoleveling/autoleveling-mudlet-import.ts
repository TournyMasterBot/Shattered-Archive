// apps/game-client/src/features/autoleveling/autoleveling-mudlet-import.ts

/**
 * Mudlet Leveling Script Importer
 * --------------------------------
 * Parses the Lua table format used by Mudlet's Leveling script and converts
 * areas into BuildStep arrays compatible with the path builder.
 *
 * Expected Lua structure:
 *   Leveling.areas = {
 *     ["area-name"] = {
 *       ["dirs"] = { "n", "open north;n", ... },
 *       ["allowed_mobs"] = { ["keyword"] = "Full look description.", ... },
 *       ["description"] = "...",
 *       ["levels"] = "...",
 *     },
 *   }
 */

import type { BuildStep } from './autoleveling-user-paths';

export type MudletMob = {
  key: string;   // engage keyword
  look: string;  // full room description
};

export type MudletArea = {
  name: string;
  dirs: string[];      // raw dir entries from Lua (may contain ';' compound cmds)
  mobs: MudletMob[];
  description: string;
  levels: string;
};

export type MudletParseResult = {
  areas: MudletArea[];
  errors: string[];
};

/* ---------- parser internals ---------- */

function stripLuaComments(src: string): string {
  return src.replace(/--[^\n]*/g, '');
}

/**
 * Starting at `start` (which must point to '{'), return the index of the
 * matching '}'. Returns -1 on unbalanced input.
 * Skips over Lua string literals so braces inside strings don't count.
 */
function findMatchingBrace(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unescapeLuaString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

/** Extract ["fieldName"] = { "str1", "str2", ... } into a string array. */
function parseLuaStringArray(src: string, fieldName: string): string[] {
  const pattern = new RegExp(`\\["${escapeRegex(fieldName)}"\\]\\s*=\\s*\\{`);
  const match = src.match(pattern);
  if (!match || match.index == null) return [];

  const bracePos = match.index + match[0].length - 1;
  const endBrace = findMatchingBrace(src, bracePos);
  if (endBrace < 0) return [];

  const inner = src.slice(bracePos + 1, endBrace);
  const result: string[] = [];
  const strPat = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = strPat.exec(inner)) !== null) {
    result.push(unescapeLuaString(m[1]));
  }
  return result;
}

/** Extract ["fieldName"] = "string value". */
function parseLuaStringField(src: string, fieldName: string): string {
  const pattern = new RegExp(`\\["${escapeRegex(fieldName)}"\\]\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = src.match(pattern);
  return match ? unescapeLuaString(match[1]) : '';
}

/** Extract ["allowed_mobs"] = { ["key"] = "value", ... }. */
function parseMobsTable(src: string): MudletMob[] {
  const match = src.match(/\["allowed_mobs"\]\s*=\s*\{/);
  if (!match || match.index == null) return [];

  const bracePos = match.index + match[0].length - 1;
  const endBrace = findMatchingBrace(src, bracePos);
  if (endBrace < 0) return [];

  const inner = src.slice(bracePos + 1, endBrace);
  const mobs: MudletMob[] = [];
  const entryPat = /\["([^"]+)"\]\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = entryPat.exec(inner)) !== null) {
    mobs.push({ key: m[1], look: unescapeLuaString(m[2]) });
  }
  return mobs;
}

function parseAreaContent(name: string, inner: string): MudletArea {
  return {
    name,
    dirs: parseLuaStringArray(inner, 'dirs'),
    mobs: parseMobsTable(inner),
    description: parseLuaStringField(inner, 'description'),
    levels: parseLuaStringField(inner, 'levels'),
  };
}

/* ---------- buff parsing ---------- */

export type MudletBuff = {
  role: 'haste' | 'fury' | 'detects' | 'sanc';
  cmd: string;             // individual command (already split from compound ';' strings)
  inferredAffect: string;  // guessed affect name for if_affect_missing, may be empty
};

/** Guess the GMCP affect name from a cast/quaff command. */
function inferAffectName(cmd: string): string {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith('cast ')) return c.slice(5).trim();
  if (c.startsWith('c ')) return c.slice(2).trim();
  if (c.startsWith('quaff ')) return ''; // item-based effect, user must fill in
  return c; // bare commands like "berserk" are their own affect
}

/** Extract the value of a Lua property or setter call, or null if not found. */
function extractLuaBuffValue(src: string, propName: string, setterName: string): string | null {
  // Direct assignment: Leveling.hasteAction = "value"
  const propPat = new RegExp(`Leveling\\.${escapeRegex(propName)}\\s*=\\s*"([^"]*)"`, 'm');
  const propMatch = src.match(propPat);
  if (propMatch) return propMatch[1];

  // Function call: Leveling.setHaste("value")
  const fnPat = new RegExp(`Leveling\\.${escapeRegex(setterName)}\\s*\\(\\s*"([^"]*)"\\s*\\)`, 'm');
  const fnMatch = src.match(fnPat);
  if (fnMatch) return fnMatch[1];

  return null;
}

/**
 * Parse haste / fury / detects / sanc buff commands from a Mudlet Leveling script.
 * Returns one MudletBuff per individual command (compound ';' strings are split).
 */
export function parseMudletBuffs(lua: string): MudletBuff[] {
  const src = stripLuaComments(lua);
  const buffs: MudletBuff[] = [];

  const defs: { role: MudletBuff['role']; prop: string; setter: string }[] = [
    { role: 'haste',   prop: 'hasteAction',   setter: 'setHaste'   },
    { role: 'fury',    prop: 'fury',           setter: 'setFury'    },
    { role: 'detects', prop: 'detectsAction',  setter: 'setDetects' },
    { role: 'sanc',    prop: 'sancAction',     setter: 'setSanc'    },
  ];

  for (const { role, prop, setter } of defs) {
    const raw = extractLuaBuffValue(src, prop, setter);
    if (!raw || !raw.trim()) continue;

    // Split compound commands so each becomes its own buff entry
    const cmds = raw.split(';').map((s) => s.trim()).filter(Boolean);
    for (const cmd of cmds) {
      buffs.push({ role, cmd, inferredAffect: inferAffectName(cmd) });
    }
  }

  return buffs;
}

/* ---------- public API ---------- */

export function parseMudletScript(lua: string): MudletParseResult {
  const errors: string[] = [];
  const src = stripLuaComments(lua);

  // Locate the outer areas table — accept "Leveling.areas = {" or bare "{"
  let tableStart = -1;
  const decl = src.match(/Leveling\.areas\s*=\s*\{/);
  if (decl && decl.index != null) {
    tableStart = decl.index + decl[0].length - 1;
  } else {
    tableStart = src.indexOf('{');
  }

  if (tableStart < 0) {
    errors.push('No table found. Paste a Leveling.areas = { ... } block.');
    return { areas: [], errors };
  }

  const tableEnd = findMatchingBrace(src, tableStart);
  if (tableEnd < 0) {
    errors.push('Unbalanced braces — could not find end of areas table.');
    return { areas: [], errors };
  }

  const tableContent = src.slice(tableStart + 1, tableEnd);

  // Parse each ["area-name"] = { ... } entry
  const areas: MudletArea[] = [];
  const areaPattern = /\["([^"]+)"\]\s*=\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = areaPattern.exec(tableContent)) !== null) {
    const name = match[1];
    const bracePos = match.index + match[0].length - 1;
    const endBrace = findMatchingBrace(tableContent, bracePos);

    if (endBrace < 0) {
      errors.push(`Unbalanced braces in area "${name}" — skipped.`);
      continue;
    }

    const inner = tableContent.slice(bracePos + 1, endBrace);
    areas.push(parseAreaContent(name, inner));
  }

  if (areas.length === 0 && errors.length === 0) {
    errors.push('No area entries found. Expected ["area-name"] = { ... } table entries.');
  }

  return { areas, errors };
}

/**
 * Convert a Mudlet area's dirs array to BuildSteps.
 * Compound entries like "open north;n" are split on ';' into individual steps,
 * matching how the autoleveling engine processes the flat semicolon-delimited path.
 */
export function mudletDirsToBuildSteps(dirs: string[]): BuildStep[] {
  const steps: BuildStep[] = [];
  for (const dir of dirs) {
    const parts = dir.split(';').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      steps.push({ kind: 'move', dir: part });
    }
  }
  return steps;
}
