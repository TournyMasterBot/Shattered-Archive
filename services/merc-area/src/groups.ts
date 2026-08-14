/**
 * groups.dat — the boot-time skill-GROUP data overlay (MUD Builder Phase 8).
 *
 * group_table (const.c) drives character-creation costs (customize) and
 * gain/practice bundles. groups.dat overlays the DATA of existing rows at
 * boot (loaded by skills_data.c right after skills.dat). Group names are row
 * identity and immutable (player files persist "Gr '<name>'" lines; C code
 * hardcodes group_add("rom basics") and the class base/default groups), and
 * the overlay can only MODIFY the compiled rows — every C loop over the
 * table breaks at the first NULL name, so rows can never be added, removed,
 * or reordered from data.
 *
 * Format (line-oriented; string lines end in '~'):
 *
 *   V1
 *   <name>~
 *   <rat0> <rat1> <rat2> <rat3> <memberCount>
 *   <member>~        (exactly memberCount lines, 0..15)
 *   ...more records...
 *   $~
 *
 * Safety rules mirrored in the C loader:
 *  - members must resolve to a compiled stock skill or group the same way
 *    group_add resolves them: skill_lookup FIRST, then group_lookup, both
 *    case-insensitive PREFIX matchers (stock itself relies on this —
 *    illusion lists 'invis', which resolves to the skill "invisibility");
 *  - membership must stay acyclic: group_add/gn_add recurse unconditionally
 *    (skills.c:972 calls gn_add even for already-known groups), so ANY cycle
 *    — including a group listing itself — is infinite recursion and a crash.
 */

import { ParseError } from './reader.js';
import { EmitError } from './emit.js';
import { STOCK_SKILLS } from './skills-stock.js';
import { STOCK_GROUPS } from './groups-stock.js';
import type { StockGroupRow } from './groups-stock.js';

export interface GroupEntry {
  name: string;
  ratings: number[]; // per class, MAX_CLASS = 4; -1 = unavailable, 0 = free/auto
  members: string[]; // exact stock skill or group names, max MAX_IN_GROUP
}

export interface GroupsFile {
  groups: GroupEntry[];
}

export interface GroupsSummary {
  errors: string[];
  warnings: string[];
}

export const MAX_IN_GROUP = 15;
const MAX_CLASS = 4;
const SH_INT_MAX = 32767;

const stockGroupByName = new Map<string, StockGroupRow>(STOCK_GROUPS.map((g) => [g.name, g]));
const stockSkillNames: readonly string[] = STOCK_SKILLS.map((s) => s.name);
const stockGroupNames: readonly string[] = STOCK_GROUPS.map((g) => g.name);

/** C str_prefix semantics: is `prefix` a case-insensitive prefix of `full`? */
function isPrefixOf(prefix: string, full: string): boolean {
  return prefix.length > 0 && prefix.length <= full.length && full.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * Resolve a member name exactly like group_add: skill_lookup first, then
 * group_lookup, both first-match prefix scans in table order. Returns what
 * the game would act on.
 */
export function resolveMember(name: string): { kind: 'skill' | 'group'; name: string } | null {
  for (const s of stockSkillNames) if (isPrefixOf(name, s)) return { kind: 'skill', name: s };
  for (const g of stockGroupNames) if (isPrefixOf(name, g)) return { kind: 'group', name: g };
  return null;
}

export type { StockGroupRow };

/** The full stock group table as an editable model (deep copies, const.c order). */
export function stockGroupsFile(): GroupsFile {
  return {
    groups: STOCK_GROUPS.map((g) => ({
      name: g.name,
      ratings: [...g.ratings],
      members: [...g.members],
    })),
  };
}

/** The compiled stock row for a group name, or undefined. */
export function stockGroup(name: string): StockGroupRow | undefined {
  return stockGroupByName.get(name);
}

/** Names legal as group members: every stock skill and every stock group. */
export function groupMemberCandidates(): { skills: string[]; groups: string[] } {
  return {
    skills: STOCK_SKILLS.map((s) => s.name),
    groups: STOCK_GROUPS.map((g) => g.name),
  };
}

function tildeLine(body: string, what: string): string {
  if (body.includes('~')) throw new EmitError(`${what} contains '~', which cannot be represented in groups.dat`);
  if (body.includes('\n') || body.includes('\r')) throw new EmitError(`${what} must be a single line`);
  return `${body}~`;
}

export function emitGroupsFile(file: GroupsFile): string {
  const out: string[] = ['V1'];
  for (const g of file.groups) {
    if (g.ratings.length !== MAX_CLASS)
      throw new EmitError(`group '${g.name}': ratings must have exactly ${MAX_CLASS} entries`);
    if (g.members.length > MAX_IN_GROUP)
      throw new EmitError(`group '${g.name}': ${g.members.length} members exceeds MAX_IN_GROUP ${MAX_IN_GROUP}`);
    out.push(tildeLine(g.name, `group name '${g.name}'`));
    out.push([...g.ratings, g.members.length].join(' '));
    for (const m of g.members) out.push(tildeLine(m, `group '${g.name}' member`));
  }
  out.push('$~');
  return out.join('\n') + '\n';
}

function stripTilde(raw: string, lineNo: number, what: string): string {
  if (!raw.endsWith('~')) throw new ParseError(`${what}: expected a line ending in '~', got "${raw}"`, lineNo);
  return raw.slice(0, -1);
}

export function parseGroupsFile(text: string): GroupsFile {
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // trailing newline
  let i = 0;
  const next = (): string => {
    if (i >= lines.length) throw new ParseError('unexpected end of file', lines.length);
    return lines[i++];
  };

  if (next() !== 'V1') throw new ParseError(`groups.dat must start with "V1"`, 1);

  const groups: GroupEntry[] = [];
  for (;;) {
    const nameLine = next();
    const nameLineNo = i;
    if (nameLine === '$~') break;
    const name = stripTilde(nameLine, nameLineNo, 'group name');

    const numLineNo = i + 1;
    const tokens = next().trim().split(/\s+/);
    if (tokens.length !== 5)
      throw new ParseError(`group '${name}': expected "<rat0..3> <memberCount>" (5 numbers), got ${tokens.length} field(s)`, numLineNo);
    const nums = tokens.map((t, ti) => {
      if (!/^-?\d+$/.test(t)) throw new ParseError(`group '${name}': field ${ti + 1} is not a number: "${t}"`, numLineNo);
      return parseInt(t, 10);
    });
    const count = nums[4];
    if (count < 0 || count > MAX_IN_GROUP)
      throw new ParseError(`group '${name}': member count ${count} out of range 0..${MAX_IN_GROUP}`, numLineNo);

    const members: string[] = [];
    for (let m = 0; m < count; m++) members.push(stripTilde(next(), i, `group '${name}' member`));

    groups.push({ name, ratings: nums.slice(0, 4), members });
  }
  return { groups };
}

/**
 * Cycle check over the prospective table: stock membership overridden by the
 * rows in `file`. Returns the names of groups that sit on a membership cycle.
 * Edges follow resolveMember — a name the game would resolve to a SKILL never
 * recurses (skills shadow groups), so only group-resolving members are edges.
 */
function findCycleGroups(file: GroupsFile): Set<string> {
  const overlay = new Map<string, readonly string[]>();
  for (const g of file.groups) if (stockGroupByName.has(g.name)) overlay.set(g.name, g.members);
  const membersOf = (name: string): readonly string[] =>
    overlay.get(name) ?? stockGroupByName.get(name)?.members ?? [];

  const onCycle = new Set<string>();
  // colors: 0 unvisited, 1 in current DFS stack, 2 done
  const color = new Map<string, number>();
  const stack: string[] = [];

  const dfs = (name: string): void => {
    color.set(name, 1);
    stack.push(name);
    for (const raw of membersOf(name)) {
      const resolved = resolveMember(raw);
      if (resolved === null || resolved.kind !== 'group') continue; // skill or unknown: no edge
      const m = resolved.name;
      const c = color.get(m) ?? 0;
      if (c === 0) dfs(m);
      else if (c === 1) {
        // everything from m to the top of the stack is on the cycle
        for (let k = stack.lastIndexOf(m); k >= 0 && k < stack.length; k++) onCycle.add(stack[k]);
      }
    }
    stack.pop();
    color.set(name, 2);
  };

  for (const g of STOCK_GROUPS) if ((color.get(g.name) ?? 0) === 0) dfs(g.name);
  return onCycle;
}

/**
 * Semantic validation against the compiled stock tables. Errors are
 * save-blocking (the C loader would bug()+skip — or in the cycle case the
 * game would crash at the first group_add); warnings flag unusual edits.
 */
export function validateGroups(file: GroupsFile): GroupsSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const g of file.groups) {
    const who = `group '${g.name}'`;
    const stock = stockGroupByName.get(g.name);
    if (!stock) {
      errors.push(`${who}: not in the compiled group table — new groups need C code, only existing rows can be overlaid`);
      continue;
    }
    if (seen.has(g.name)) errors.push(`${who}: listed more than once`);
    seen.add(g.name);

    if (g.ratings.length !== MAX_CLASS) errors.push(`${who}: ratings must have ${MAX_CLASS} entries`);
    for (const r of g.ratings) {
      if (!Number.isInteger(r) || r < -1 || r > SH_INT_MAX)
        errors.push(`${who}: rating ${r} out of range (-1 = unavailable, 0 = free, 1..${SH_INT_MAX} = cost)`);
    }

    if (g.members.length > MAX_IN_GROUP)
      errors.push(`${who}: ${g.members.length} members exceeds MAX_IN_GROUP ${MAX_IN_GROUP}`);
    if (g.members.length === 0) warnings.push(`${who}: has no members — it would grant nothing`);

    const memberSeen = new Set<string>();
    for (const m of g.members) {
      const resolved = resolveMember(m);
      if (resolved === null)
        errors.push(`${who}: member '${m}' does not resolve to any stock skill or group (the game matches skill-first by prefix)`);
      else if (resolved.kind === 'group' && resolved.name === g.name)
        errors.push(`${who}: member '${m}' resolves to the group itself — group_add recursion would crash`);
      if (memberSeen.has(m)) warnings.push(`${who}: member '${m}' listed more than once`);
      memberSeen.add(m);
      if (m.includes('~') || m.includes('\n') || m.includes('\r'))
        errors.push(`${who}: member '${m}' cannot be represented in groups.dat`);
    }
  }

  const cyclic = findCycleGroups(file);
  for (const name of cyclic)
    errors.push(`group '${name}': membership cycle — group_add/gn_add recurse unconditionally and would overflow the stack`);

  return { errors, warnings };
}
