/**
 * Damage lines of a fight, in the game's words.
 *
 * `merc-mud/2.4/src/fight.c` `dam_message` names every blow by how much damage it did (`dam <= 4` is a scratch, `<= 8` a graze, and so on up to
 * "does UNSPEAKABLE things to"). A player never sees the number, only the verb, so each verb is a range of damage. The messages the character
 * sees are:
 *
 *   You <verb> <target>.                      a plain blow of the character          (verb = first person: "hit", "scratch")
 *   Your <attack> <verbs> <target>.           a skill or spell of the character      (verbs = third person: "hits", "scratches")
 *   <Name> <verbs> you.                       a plain blow at the character
 *   <Name>'s <attack> <verbs> you.            a skill or spell at the character
 *   <Name> is unaffected by your <attack>!    immune (no damage)         <Name>'s <attack> is powerless against you.
 *
 * Blows between two other creatures are not written to this character in the first and second person, so they never match.
 *
 * Pure and dependency-free.
 */

interface Verb {
  /** First person ("You scratch") and third person ("scratches"). */
  first: string;
  third: string;
  min: number;
  max: number;
}

/** Highest damage a message can mean when the game says "UNSPEAKABLE" (it has no upper bound; this keeps estimates finite). */
const UNSPEAKABLE_MAX = 200;

/** From `dam_message`, in order. */
export const DAMAGE_VERBS: readonly Verb[] = [
  { first: 'miss', third: 'misses', min: 0, max: 0 },
  { first: 'scratch', third: 'scratches', min: 1, max: 4 },
  { first: 'graze', third: 'grazes', min: 5, max: 8 },
  { first: 'hit', third: 'hits', min: 9, max: 12 },
  { first: 'injure', third: 'injures', min: 13, max: 16 },
  { first: 'wound', third: 'wounds', min: 17, max: 20 },
  { first: 'maul', third: 'mauls', min: 21, max: 24 },
  { first: 'decimate', third: 'decimates', min: 25, max: 28 },
  { first: 'devastate', third: 'devastates', min: 29, max: 32 },
  { first: 'maim', third: 'maims', min: 33, max: 36 },
  { first: 'MUTILATE', third: 'MUTILATES', min: 37, max: 40 },
  { first: 'DISEMBOWEL', third: 'DISEMBOWELS', min: 41, max: 44 },
  { first: 'DISMEMBER', third: 'DISMEMBERS', min: 45, max: 48 },
  { first: 'MASSACRE', third: 'MASSACRES', min: 49, max: 52 },
  { first: 'MANGLE', third: 'MANGLES', min: 53, max: 56 },
  { first: '*** DEMOLISH ***', third: '*** DEMOLISHES ***', min: 57, max: 60 },
  { first: '*** DEVASTATE ***', third: '*** DEVASTATES ***', min: 61, max: 75 },
  { first: '=== OBLITERATE ===', third: '=== OBLITERATES ===', min: 76, max: 100 },
  { first: '>>> ANNIHILATE <<<', third: '>>> ANNIHILATES <<<', min: 101, max: 125 },
  { first: '<<< ERADICATE >>>', third: '<<< ERADICATES >>>', min: 126, max: 150 },
  { first: 'do UNSPEAKABLE things to', third: 'does UNSPEAKABLE things to', min: 151, max: UNSPEAKABLE_MAX },
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const THIRD = DAMAGE_VERBS.map((v) => escape(v.third)).join('|');
const FIRST = DAMAGE_VERBS.map((v) => escape(v.first)).join('|');

const YOU_PLAIN = new RegExp(`^You (${FIRST}) (.+?)([.!])$`);
const YOU_SKILL = new RegExp(`^Your (.+?) (${THIRD}) (.+?)([.!])$`);
const AT_YOU_SKILL = new RegExp(`^(.+?)'s (.+?) (${THIRD}) you([.!])$`);
const AT_YOU_PLAIN = new RegExp(`^(.+?) (${THIRD}) you([.!])$`);

/**
 * `<head><middle><tail><end>` with a non-empty head and tail, split at the first `middle`. The immunity lines are cut with
 * string searches because a regex with two open groups around fixed words backtracks quadratically on a hostile line.
 */
function splitAround(text: string, middle: string, end: string): [string, string] | undefined {
  if (!text.endsWith(end)) return undefined;
  const at = text.indexOf(middle, 1);
  const from = at + middle.length;
  const to = text.length - end.length;
  return at < 0 || from >= to ? undefined : [text.slice(0, at), text.slice(from, to)];
}

/**
 * A longer line is not read as a blow. A MUD line is around 80 columns, so this is far above any real one; it bounds the
 * backtracking of the patterns above, which have open groups around the verbs.
 */
export const MAX_BLOW_LINE = 1024;

export interface Blow {
  /** `dealt` is the character's blow, `taken` a blow at the character. */
  direction: 'dealt' | 'taken';
  /** The other creature as the line names it. */
  other: string;
  /** The skill or spell noun, or undefined for a plain blow. */
  attack?: string;
  /** The damage range the verb means. */
  min: number;
  max: number;
}

const byFirst = (verb: string): Verb => DAMAGE_VERBS.find((v) => v.first === verb) as Verb;
const byThird = (verb: string): Verb => DAMAGE_VERBS.find((v) => v.third === verb) as Verb;

/** The middle of a blow's damage range, the best single number for an estimate. */
export function midDamage(blow: Pick<Blow, 'min' | 'max'>): number {
  return (blow.min + blow.max) / 2;
}

/** The blow in one line of game text (colour removed), or undefined when the line is not one the character takes part in. */
export function parseBlowLine(line: string): Blow | undefined {
  const text = line.trim();
  if (text.length > MAX_BLOW_LINE) return undefined;
  let m: RegExpExecArray | null;
  if ((m = YOU_PLAIN.exec(text))) {
    const verb = byFirst(m[1]);
    // "You hit yourself." is the character's own blow at itself: not a fight with someone
    return m[2] === 'yourself' ? undefined : { direction: 'dealt', other: m[2], min: verb.min, max: verb.max };
  }
  if ((m = YOU_SKILL.exec(text))) {
    const verb = byThird(m[2]);
    return m[3] === 'you' ? undefined : { direction: 'dealt', other: m[3], attack: m[1], min: verb.min, max: verb.max };
  }
  if ((m = AT_YOU_SKILL.exec(text))) {
    const verb = byThird(m[3]);
    return { direction: 'taken', other: m[1], attack: m[2], min: verb.min, max: verb.max };
  }
  if ((m = AT_YOU_PLAIN.exec(text))) {
    const verb = byThird(m[2]);
    return { direction: 'taken', other: m[1], min: verb.min, max: verb.max };
  }
  const theyImmune = splitAround(text, ' is unaffected by your ', '!');
  if (theyImmune) return { direction: 'dealt', other: theyImmune[0], attack: theyImmune[1], min: 0, max: 0 };
  const youImmune = splitAround(text, "'s ", ' is powerless against you.');
  if (youImmune) return { direction: 'taken', other: youImmune[0], attack: youImmune[1], min: 0, max: 0 };
  return undefined;
}
