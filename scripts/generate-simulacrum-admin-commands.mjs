#!/usr/bin/env node
/**
 * Generates apps/game-client/src/features/simulacrumAdmin/commandTable.generated.ts from the simulacrum (merc-mud)
 * command table, so the panel's list of privileged commands cannot drift from the game by hand-editing
 * (docs/standards/edge-cases/admin-tooling.md, ADMIN-01).
 *
 * Usage: node scripts/generate-simulacrum-admin-commands.mjs [--source <interp.c>] [--out <file.ts>] [--check]
 *   --source  defaults to ../merc-mud/2.4/src/interp.c next to this repository
 *   --out     defaults to the committed file
 *   --check   writes nothing; exits 1 when the committed file differs from what the source would generate
 *
 * Re-run it after ANY change to the privileged rows of the game's command table, then fix the syntax entries
 * (commandSyntax.ts) that the catalog test names. Output is deterministic: sorted, no date, hash of the privileged rows.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

export const DEFAULT_SOURCE = path.resolve(repoRoot, '..', 'merc-mud', '2.4', 'src', 'interp.c');
export const DEFAULT_OUT = path.resolve(
  repoRoot,
  'apps',
  'game-client',
  'src',
  'features',
  'simulacrumAdmin',
  'commandTable.generated.ts',
);

/**
 * The trust each level symbol stands for. The game defines them without parentheses (`L1 MAX_LEVEL - 1`), so this
 * table is keyed by the symbol and never evaluates the expression. Values: interp.h:34-43 and merc.h:129-131.
 */
export const LEVEL_SYMBOLS = {
  ML: 60,
  L1: 59,
  L2: 58,
  L3: 57,
  L4: 56,
  L5: 55,
  L6: 54,
  L7: 53,
  L8: 52,
  IM: 52,
  HE: 51,
};
/** Symbols that make a row a privileged (immortal) command. `HE` is a mortal hero-level row and is left out. */
const PRIVILEGED = new Set(['ML', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'IM']);

/**
 * When several rows share a handler the panel offers one command. This picks the name shown; the others become aliases.
 * Without an entry the first row with `show` = 1 in table order is used.
 */
const CANONICAL = { do_transfer: 'transfer' };

const ROW = /^\s*\{\s*"([^"]*)"\s*,\s*(do_\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\d+)\s*\}\s*,?\s*$/;

/** Blanks every /* ... *\/ comment but keeps the line breaks, so reported line numbers stay the file's own. */
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Reads the privileged rows of `cmd_table[]`.
 * @returns {{ name: string, handler: string, levelSymbol: string, level: number, show: boolean, line: number }[]}
 */
export function parseRows(source) {
  const lines = blankComments(source).split('\n');
  const start = lines.findIndex((l) => /cmd_table\s*\[\s*\]\s*=\s*\{/.test(l));
  if (start === -1) throw new Error('cmd_table[] not found in the source');
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const text = lines[i];
    if (!text.trim()) continue;
    if (/^\s*\{\s*""\s*,/.test(text)) break; // the end-of-list row
    const m = ROW.exec(text);
    if (!m) throw new Error(`line ${i + 1}: cannot read this command row: ${text.trim()}`);
    const [, name, handler, , levelText, , show] = m;
    if (/^\d+$/.test(levelText)) continue; // a numeric level is a mortal row
    if (!(levelText in LEVEL_SYMBOLS)) throw new Error(`line ${i + 1}: unknown level symbol ${levelText} (command ${name})`);
    if (!PRIVILEGED.has(levelText)) continue;
    rows.push({ name, handler, levelSymbol: levelText, level: LEVEL_SYMBOLS[levelText], show: show === '1', line: i + 1 });
  }
  if (rows.length === 0) throw new Error('no privileged rows found');
  return rows;
}

/**
 * Merges rows into commands:
 *  - rows with the same handler are one command (`teleport`/`transfer`, `invis`/`wizinvis`, `immtalk`/`:`);
 *  - a `show` = 0 row whose name is a strict prefix of a listed command of the same level is its hidden alias
 *    (`reboo` -> `reboot`, `shutdow` -> `shutdown`, `sla` -> `slay`, `prefi` -> `prefix`): never offered.
 * @returns {{ name: string, aliases: string[], hiddenAliases: string[], handler: string, level: number, levelSymbol: string, listed: boolean }[]}
 */
export function mergeRows(rows) {
  const byHandler = new Map();
  for (const row of rows) {
    const list = byHandler.get(row.handler) ?? [];
    list.push(row);
    byHandler.set(row.handler, list);
  }
  const commands = [];
  for (const [handler, group] of byHandler) {
    const levels = new Set(group.map((r) => r.levelSymbol));
    if (levels.size > 1) {
      throw new Error(`line ${group[0].line}: rows of ${handler} have different levels (${[...levels].join(', ')})`);
    }
    const listed = group.filter((r) => r.show);
    const canonicalName = CANONICAL[handler];
    const head =
      group.find((r) => r.name === canonicalName) ?? listed[0] ?? group[0];
    const others = group.filter((r) => r !== head).map((r) => r.name);
    commands.push({
      name: head.name,
      aliases: others.filter((n) => group.find((r) => r.name === n).show).sort(),
      hiddenAliases: others.filter((n) => !group.find((r) => r.name === n).show).sort(),
      handler,
      level: head.level,
      levelSymbol: head.levelSymbol,
      listed: head.show,
    });
  }
  // Prefix rows with their own handler (do_reboo) fold into the listed command they abbreviate.
  const folded = [];
  for (const cmd of commands) {
    const parent = cmd.listed
      ? undefined
      : commands.find(
          (other) =>
            other !== cmd &&
            other.listed &&
            other.levelSymbol === cmd.levelSymbol &&
            other.name.startsWith(cmd.name) &&
            other.name !== cmd.name,
        );
    if (parent) parent.hiddenAliases = [...new Set([...parent.hiddenAliases, cmd.name, ...cmd.hiddenAliases])].sort();
    else folded.push(cmd);
  }
  return folded.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The text of the generated TypeScript file for a source text. */
export function generate(source, sourceLabel = 'merc-mud/2.4/src/interp.c') {
  const rows = parseRows(source);
  const commands = mergeRows(rows);
  const hash = createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.name, r.handler, r.levelSymbol, r.show])))
    .digest('hex')
    .slice(0, 16);
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const list = (a) => `[${a.map(q).join(', ')}]`;
  const body = commands
    .map(
      (c) =>
        `  { name: ${q(c.name)}, aliases: ${list(c.aliases)}, hiddenAliases: ${list(c.hiddenAliases)}, handler: ${q(c.handler)}, ` +
        `level: ${c.level}, levelSymbol: ${q(c.levelSymbol)}, listed: ${c.listed} },`,
    )
    .join('\n');
  return `// GENERATED by scripts/generate-simulacrum-admin-commands.mjs - do not edit by hand.
// Source: ${sourceLabel} (privileged rows only)  rows-hash: ${hash}  rows: ${rows.length}  commands: ${commands.length}
// Re-run after any change to the game's command table: node scripts/generate-simulacrum-admin-commands.mjs

export interface GeneratedCommand {
  /** The full name the panel sends. */
  name: string;
  /** Other listed names for the same handler. */
  aliases: string[];
  /** Abbreviation rows that exist only so an abbreviation does not run the command; never offered. */
  hiddenAliases: string[];
  handler: string;
  /** Trust needed, resolved from the game's level symbol. */
  level: number;
  levelSymbol: string;
  /** False when the game leaves the command out of its own wizhelp list. */
  listed: boolean;
}

export const GENERATED_COMMANDS: readonly GeneratedCommand[] = [
${body}
];

export const GENERATED_ROWS_HASH = '${hash}';
`;
}

export function runCli(argv, io = { log: console.log, error: console.error }) {
  const opt = { source: DEFAULT_SOURCE, out: DEFAULT_OUT, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opt.source = path.resolve(argv[++i]);
    else if (argv[i] === '--out') opt.out = path.resolve(argv[++i]);
    else if (argv[i] === '--check') opt.check = true;
    else {
      io.error(`unknown argument ${argv[i]}`);
      return 2;
    }
  }
  if (!fs.existsSync(opt.source)) {
    io.error(`source not found: ${opt.source} (pass --source <interp.c>)`);
    return 2;
  }
  let text;
  try {
    text = generate(fs.readFileSync(opt.source, 'utf8'));
  } catch (error) {
    io.error(`generator failed: ${error.message}`);
    return 1;
  }
  if (opt.check) {
    const current = fs.existsSync(opt.out) ? fs.readFileSync(opt.out, 'utf8') : '';
    if (current !== text) {
      io.error('commandTable.generated.ts is out of date: re-run scripts/generate-simulacrum-admin-commands.mjs');
      return 1;
    }
    io.log('commandTable.generated.ts matches the source');
    return 0;
  }
  fs.mkdirSync(path.dirname(opt.out), { recursive: true });
  fs.writeFileSync(opt.out, text);
  io.log(`wrote ${opt.out}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
