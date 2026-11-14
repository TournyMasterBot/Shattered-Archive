/**
 * The rule that keeps Copilot out of a fight it has not looked at:
 *
 *   1. Never begin a fight before looking the monster up through the MCP (the archive).
 *   2. If the monster cannot be identified that way, `consider` it (the `con` of the game) and read the answer.
 *   3. Only then fight, and only when the answer says the fight is a fair one (`consider.ts`).
 *
 * `gateFight` is a pure decision about ONE command: it says allow, look it up, consider it, or deny. Doing the lookup, sending the `consider`
 * and reading its answer are the server's job (they need the network, the game and the clock); the gate only reads what they recorded in a
 * `MonsterKnowledge`. A command that is not the start of a fight (a move, a look, anything while a fight is already on) is allowed at once.
 *
 * What starts a fight: an attack verb (`interp.c`: kill, hit, bash, trip, kick, backstab, circle, dirt, disarm, gouge, headbutt, strike,
 * murder) with a target, or `cast` of an OFFENSIVE spell (`TAR_CHAR_OFFENSIVE`) with a target. `rescue` and `assist` name an ally, not a
 * monster, so they are not gated here.
 *
 * Pure.
 */

import { castTarget, resolveVerb } from '../policy/classify.js';
import { considerAllowsFight } from './consider.js';
import { keywordOf, type MonsterKnowledge } from './knowledge.js';
import { OFFENSIVE_SPELLS } from './offensiveSpells.js';

/** The attack verbs, by the name the classifier resolves a typed word to. */
export const ATTACK_VERBS: readonly string[] = ['kill', 'hit', 'bash', 'trip', 'kick', 'backstab', 'circle', 'dirt', 'disarm', 'gouge', 'headbutt', 'strike', 'murder'];

export type FightGate =
  /** Not the start of a fight, or everything the rule asks for is on record. */
  | { action: 'allow'; reason: string; target?: string }
  /** Ask the archive (MCP) about this monster first; the answer is recorded with `recordLookup`. */
  | { action: 'lookup'; target: string; reason: string }
  /** The archive does not know it: send this `consider` command instead, and read the answer. */
  | { action: 'consider'; target: string; command: string; reason: string }
  /** The monster is known and the fight must not start. */
  | { action: 'deny'; target: string; reason: string };

export interface GateInput {
  command: string;
  /** The room the character is in (as the log names it); knowledge is kept per room. */
  room: string;
  inFight: boolean;
  now: number;
  knowledge: MonsterKnowledge;
  /** False when there is no archive to ask for this world (the Simulacrum is another game): the lookup step is skipped and `consider` is first. */
  lookupAvailable: boolean;
}

/** True when `word` (a typed spell, maybe an abbreviation or the first word of a longer name) is, or can be, an offensive spell. */
function offensiveSpell(spell: string): boolean {
  const lower = spell.toLowerCase();
  return lower !== '' && OFFENSIVE_SPELLS.some((name) => name.startsWith(lower));
}

/** The spell typed after `cast`: a quoted name, or the first word. */
function spellOf(args: string[]): string {
  const text = args.join(' ').trim();
  if (text[0] === "'" || text[0] === '"') {
    const close = text.indexOf(text[0], 1);
    return (close < 0 ? text.slice(1) : text.slice(1, close)).trim();
  }
  return text.split(/\s+/)[0];
}

/**
 * The attack verb (or `cast`) a typed word can mean. The game reads a short form by the order of its own command table (`c` is `cast`, `ki`
 * is `kill`), and this package does not know that order, so the cautious rule is used: a word that could be the start of an attack verb IS
 * one, unless it is exactly the name of another command (`tell`). That can read a stray short word as an attack and ask for a lookup that was
 * not needed; it can never let a fight start unlooked.
 */
function fightVerbOf(word: string): string | undefined {
  const lower = word.toLowerCase();
  if (lower === '') return undefined; // an empty word is a prefix of every name
  const resolved = resolveVerb(lower);
  if (resolved !== undefined && (resolved.name === 'cast' || ATTACK_VERBS.includes(resolved.name))) return resolved.name;
  if (resolved?.name === lower) return undefined;
  return ['cast', ...ATTACK_VERBS].find((verb) => verb.startsWith(lower));
}

/** The target text of a fight-starting command, or undefined when the command does not start a fight. `target: ''` is a fight verb with no target. */
export function fightTargetOf(command: string): { target: string } | undefined {
  const [verb, ...args] = command.trim().split(/\s+/);
  const name = fightVerbOf(verb);
  if (name === undefined) return undefined;
  if (name !== 'cast') return { target: args[0] ?? '' };
  const target = castTarget(args);
  if (target === undefined || /^(self|me|myself)$/i.test(target) || !offensiveSpell(spellOf(args))) return undefined;
  return { target };
}

export function gateFight(input: GateInput): FightGate {
  if (input.inFight) return { action: 'allow', reason: 'already in a fight' };
  const parsed = fightTargetOf(input.command);
  if (parsed === undefined) return { action: 'allow', reason: 'not the start of a fight' };
  const target = keywordOf(parsed.target);
  if (target === '') return { action: 'allow', reason: 'no target named: the game will ask whom' };

  const known = input.knowledge.get(input.room, target, input.now);
  if (input.lookupAvailable && known?.lookup === undefined) return { action: 'lookup', target, reason: `look up "${target}" in the archive before fighting it` };
  if (known?.lookup?.found === true) return { action: 'allow', reason: `the archive knows "${target}"`, target };

  const considered = known?.considered?.result;
  if (considered === undefined) {
    return { action: 'consider', target, command: `consider ${target}`, reason: `"${target}" is not identified by the archive: consider it before fighting` };
  }
  if (considerAllowsFight(considered)) return { action: 'allow', reason: `considered "${target}": a fair fight`, target };
  if (considered.kind === 'band') return { action: 'deny', target, reason: `considered "${target}": too strong to fight` };
  if (considered.kind === 'refused') return { action: 'deny', target, reason: `the game does not allow a fight with "${target}"` };
  return { action: 'consider', target, command: `consider ${target}`, reason: `"${target}" was not in the room when considered: consider it again` };
}
