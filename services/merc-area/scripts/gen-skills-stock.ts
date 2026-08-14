import fs from 'fs';
import path from 'path';

/**
 * Host-run only. Regenerates src/skills-stock.ts and src/groups-stock.ts from
 * merc-mud/2.4/src/const.c's skill_table and group_table — the two generated
 * snapshots this package ships alongside its overlay format code. Run this,
 * `git diff` the result, and commit ONLY after a human has reviewed it —
 * see the Phase 15 plan's Constraints for why this is deliberately a
 * host-run step, never part of an automated pipeline.
 *
 * Two real C-parsing gotchas were found and fixed by hand in this codebase
 * before this script existed (see skills-stock.ts's .annotated entry), both
 * handled below: (1) adjacent C string-literal concatenation with no comma
 * between literals (e.g. `""` then `"!cancellation!"` on the next line —
 * C concatenates these, a naive one-literal-per-field regex silently drops
 * the second), and (2) literal raw control bytes typed directly into a
 * const.c string (e.g. a real TAB byte, not a `\t` two-character escape) —
 * both require decoding to a logical character value BEFORE re-joining
 * adjacent literals, then re-encoding as a proper TS string escape on the
 * way out. Never pass captured source text through verbatim.
 *
 * Usage: pnpm --filter @shatteredarchive/merc-area gen-skills-stock
 * Reads MERC_MUD_PATH (same default as mud-builder-server's config.ts) for
 * where to find the merc-mud checkout.
 */

const POS: Record<string, number> = {
  POS_DEAD: 0,
  POS_MORTAL: 1,
  POS_INCAP: 2,
  POS_STUNNED: 3,
  POS_SLEEPING: 4,
  POS_RESTING: 5,
  POS_SITTING: 6,
  POS_FIGHTING: 7,
  POS_STANDING: 8,
};
const TAR: Record<string, number> = {
  TAR_IGNORE: 0,
  TAR_CHAR_OFFENSIVE: 1,
  TAR_CHAR_DEFENSIVE: 2,
  TAR_CHAR_SELF: 3,
  TAR_OBJ_INV: 4,
  TAR_OBJ_CHAR_DEF: 5,
  TAR_OBJ_CHAR_OFF: 6,
};

/**
 * Decodes a raw captured C string-literal BODY (the text between the quotes,
 * as written in source) into its logical character value. Must run BEFORE
 * concatenating adjacent literals — matches C semantics, where adjacent
 * literals concatenate at the character level, not the source-text level.
 */
function decodeCString(raw: string): string {
  return raw.replace(/\\(.)/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '\\':
        return '\\';
      case '"':
        return '"';
      case "'":
        return "'";
      default:
        return ch; // pass through unrecognized escapes verbatim (none expected in this table)
    }
  });
}

/** Joins one-or-more adjacent quoted literals (a "span" of source text) into their concatenated logical value. */
function joinLiterals(span: string): string {
  const litRe = /"((?:[^"\\]|\\.)*)"/g;
  let out = '';
  let lm: RegExpExecArray | null;
  while ((lm = litRe.exec(span)) !== null) out += decodeCString(lm[1]);
  return out;
}

/** Every quoted literal in a raw member/name list, decoded individually (no adjacent-concatenation case expected here, but decoded the same way for consistency/safety). */
function parseStringList(raw: string): string[] {
  const re = /"((?:[^"\\]|\\.)*)"/g;
  const out: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(raw)) !== null) out.push(decodeCString(mm[1]));
  return out;
}

/** Re-encodes a DECODED logical string value as a TS double-quoted string-literal body. */
function jsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
}

interface SkillRow {
  name: string;
  spellFun: string;
  target: number;
  position: number;
  levels: number[];
  ratings: number[];
  minMana: number;
  beats: number;
  nounDamage: string;
  msgOff: string;
  msgObj: string | null;
  slot: number;
  hasGsn: boolean;
}

function parseSkillTable(src: string): { rows: SkillRow[]; funs: string[]; pairs: string[] } {
  const startMarker = 'struct skill_type skill_table[MAX_SKILL] = {';
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('skill_table not found in const.c');
  const endMarker = 'struct group_type group_table[MAX_GROUP] = {';
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error("group_table not found (used as skill_table's end boundary)");
  const block = src.slice(start + startMarker.length, end);

  const oneLit = `"(?:[^"\\\\]|\\\\.)*"`;
  const strField = `((?:${oneLit}\\s*)+)`;
  const entryRe = new RegExp(
    `\\{\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*` +
      `\\{\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\}\\s*,\\s*` +
      `\\{\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\}\\s*,\\s*` +
      `(\\w+)\\s*,\\s*` +
      `(\\w+)\\s*,\\s*` +
      `(\\w+)\\s*,\\s*` +
      `(NULL|&\\w+)\\s*,\\s*` +
      `SLOT\\(\\s*(-?\\d+)\\s*\\)\\s*,\\s*` +
      `(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*` +
      `${strField}\\s*,\\s*${strField}\\s*(?:,\\s*${strField})?\\s*\\}`,
    'g',
  );

  const rows: SkillRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    const [
      ,
      name,
      l1,
      l2,
      l3,
      l4,
      r1,
      r2,
      r3,
      r4,
      spellFun,
      tar,
      pos,
      pgsn,
      slot,
      minMana,
      beats,
      nounDamageSpan,
      msgOffSpan,
      msgObjSpan,
    ] = m;
    if (name === 'reserved') continue; // row 0 — not authorable, excluded from the stock table
    if (!(tar in TAR)) throw new Error(`unknown TAR macro ${tar} in row "${name}"`);
    if (!(pos in POS)) throw new Error(`unknown POS macro ${pos} in row "${name}"`);
    rows.push({
      name: decodeCString(name),
      spellFun,
      target: TAR[tar],
      position: POS[pos],
      levels: [Number(l1), Number(l2), Number(l3), Number(l4)],
      ratings: [Number(r1), Number(r2), Number(r3), Number(r4)],
      minMana: Number(minMana),
      beats: Number(beats),
      nounDamage: joinLiterals(nounDamageSpan),
      msgOff: joinLiterals(msgOffSpan),
      msgObj: msgObjSpan === undefined ? null : joinLiterals(msgObjSpan),
      slot: Number(slot),
      hasGsn: pgsn !== 'NULL',
    });
  }
  if (rows.length < 100)
    throw new Error(
      `parsed suspiciously few skill_table rows (${rows.length}) — parser likely broke, refusing to write a truncated file`,
    );

  const funs = [...new Set(rows.map((r) => r.spellFun))].sort();
  const pairs = [...new Set(rows.map((r) => `${r.spellFun} ${r.target}`))].sort((a, b) => {
    const [fa, ta] = a.split(' ');
    const [fb, tb] = b.split(' ');
    return fa === fb ? Number(ta) - Number(tb) : fa < fb ? -1 : 1;
  });
  return { rows, funs, pairs };
}

function emitSkillsStock(parsed: { rows: SkillRow[]; funs: string[]; pairs: string[] }): string {
  function rowLine(r: SkillRow): string {
    const fields = [
      `name: "${jsEscape(r.name)}"`,
      `spellFun: "${r.spellFun}"`,
      `target: ${r.target}`,
      `position: ${r.position}`,
      `levels: [${r.levels.join(', ')}]`,
      `ratings: [${r.ratings.join(', ')}]`,
      `minMana: ${r.minMana}`,
      `beats: ${r.beats}`,
      `nounDamage: "${jsEscape(r.nounDamage)}"`,
      `msgOff: "${jsEscape(r.msgOff)}"`,
      `msgObj: ${r.msgObj === null ? 'null' : `"${jsEscape(r.msgObj)}"`}`,
      `slot: ${r.slot}`,
      `hasGsn: ${r.hasGsn}`,
    ];
    return `  { ${fields.join(', ')} },`;
  }

  return `/**
 * GENERATED from merc-mud/2.4/src/const.c skill_table — do not hand-edit.
 * Regenerate with \`pnpm --filter @shatteredarchive/merc-area gen-skills-stock\`
 * (scripts/gen-skills-stock.ts) after any const.c skill_table change, then
 * review the diff before committing.
 * Row 0 ("reserved", spell_fun 0) is excluded: it is not authorable.
 */

import type { StockSkillRow } from './skills.js';

/** Every spell function name appearing in the stock table (incl. spell_null for non-spell skills). */
export const SKILL_SPELL_FUNS: readonly string[] = [
${parsed.funs.map((f) => `  "${f}"`).join(',\n')}
];

/** Every (spellFun, target) pair proven safe at compile time, as "fun target" keys. */
export const STOCK_FUN_TARGET_PAIRS: readonly string[] = [
${parsed.pairs.map((p) => `  "${p}"`).join(',\n')}
];

export const STOCK_SKILLS: readonly StockSkillRow[] = [
${parsed.rows.map(rowLine).join('\n')}
];
`;
}

interface GroupRow {
  name: string;
  ratings: number[];
  members: string[];
}

function parseGroupTable(src: string): GroupRow[] {
  const startMarker = 'struct group_type group_table[MAX_GROUP] = {';
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('group_table not found in const.c');
  // No convenient "next struct" end marker follows group_table in const.c — but no row's own
  // text ever contains the literal sequence "};" (rows are comma-separated, never semicolon
  // terminated), so the FIRST "};" after start is unambiguously the table's own close.
  const end = src.indexOf('};', start);
  if (end === -1) throw new Error('group_table has no closing "};"');
  const block = src.slice(start + startMarker.length, end);

  const entryRe =
    /\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*,\s*\{([^{}]*)\}\s*\}/g;
  const rows: GroupRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    const [, name, r1, r2, r3, r4, membersRaw] = m;
    rows.push({
      name: decodeCString(name),
      ratings: [Number(r1), Number(r2), Number(r3), Number(r4)],
      members: parseStringList(membersRaw),
    });
  }
  if (rows.length < 20)
    throw new Error(
      `parsed suspiciously few group_table rows (${rows.length}) — parser likely broke, refusing to write a truncated file`,
    );
  return rows;
}

function emitGroupsStock(rows: GroupRow[]): string {
  function rowLine(r: GroupRow): string {
    const members = r.members.map((m) => `"${jsEscape(m)}"`).join(', ');
    return `  { name: "${jsEscape(r.name)}", ratings: [${r.ratings.join(', ')}], members: [${members}] },`;
  }

  return `/**
 * GENERATED FILE — do not edit by hand.
 * Mirror of the compiled group_table in merc-mud/2.4/src/const.c, produced by
 * \`pnpm --filter @shatteredarchive/merc-area gen-skills-stock\`
 * (scripts/gen-skills-stock.ts). Source table: ${rows.length} groups.
 */

export interface StockGroupRow {
  name: string;
  ratings: readonly number[]; // per class, -1 = unavailable, 0 = free/auto (basics)
  members: readonly string[]; // exact stock skill or group names
}

export const STOCK_GROUPS: readonly StockGroupRow[] = [
${rows.map(rowLine).join('\n')}
];
`;
}

async function main(): Promise<void> {
  const mercMudPath = process.env.MERC_MUD_PATH ?? 'C:/Projects/merc-mud';
  const constPath = path.join(mercMudPath, '2.4/src/const.c');
  if (!fs.existsSync(constPath)) {
    throw new Error(`const.c not found at ${constPath} — set MERC_MUD_PATH to the merc-mud checkout root`);
  }
  const src = fs.readFileSync(constPath, 'utf8');

  const skills = parseSkillTable(src);
  const groups = parseGroupTable(src);

  const skillsOutPath = path.resolve(process.cwd(), 'src/skills-stock.ts');
  const groupsOutPath = path.resolve(process.cwd(), 'src/groups-stock.ts');
  fs.writeFileSync(skillsOutPath, emitSkillsStock(skills), 'utf8');
  fs.writeFileSync(groupsOutPath, emitGroupsStock(groups), 'utf8');

  console.log(`Read: ${constPath}`);
  console.log(
    `Wrote: ${skillsOutPath} (${skills.rows.length} skills, ${skills.funs.length} spell funs, ${skills.pairs.length} fun/target pairs)`,
  );
  console.log(`Wrote: ${groupsOutPath} (${groups.length} groups)`);
  console.log('Review the diff (git diff) before committing.');
}

main().catch((e) => {
  console.error(`gen-skills-stock failed: ${(e as Error).message}`);
  process.exit(1);
});
