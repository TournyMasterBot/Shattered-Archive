/**
 * What `consider` (`con`) tells about a monster, read from the game's own words.
 *
 * `merc-mud/2.4/src/act_info.c` `do_consider` compares the monster's level with the character's (`diff = victim->level - ch->level`) and
 * answers with one of seven fixed sentences; "Don't even think about it." when the fight is not allowed (`is_safe`), "They're not here." when
 * there is no such monster. The sentences are the only level information a player gets for an unknown monster, so Copilot reads them
 * exactly and never guesses: a line that is not one of these is not an answer.
 *
 * Pure and dependency-free.
 */

export const CONSIDER_BANDS = ['naked', 'no-match', 'easy', 'even', 'lucky', 'laughs', 'death'] as const;
export type ConsiderBand = (typeof CONSIDER_BANDS)[number];

interface BandRow {
  band: ConsiderBand;
  /** The monster's level minus the character's, inclusive; `null` is unbounded on that side. */
  min: number | null;
  max: number | null;
  /** The sentence, with `$N` (the monster) as a capture of the name. */
  pattern: RegExp;
}

// Written in the order of do_consider; `$N` is a name of any length.
const BANDS: readonly BandRow[] = [
  { band: 'naked', min: null, max: -10, pattern: /^You can kill (.+) naked and weaponless\.$/ },
  { band: 'no-match', min: -9, max: -5, pattern: /^(.+) is no match for you\.$/ },
  { band: 'easy', min: -4, max: -2, pattern: /^(.+) looks like an easy kill\.$/ },
  { band: 'even', min: -1, max: 1, pattern: /^()The perfect match!$/ },
  { band: 'lucky', min: 2, max: 4, pattern: /^(.+) says 'Do you feel lucky, punk\?'\.$/ },
  { band: 'laughs', min: 5, max: 9, pattern: /^(.+) laughs at you mercilessly\.$/ },
  { band: 'death', min: 10, max: null, pattern: /^()Death will thank you for your gift\.$/ },
];

export type ConsiderResult =
  | { kind: 'band'; band: ConsiderBand; minDiff: number | null; maxDiff: number | null; name: string }
  /** `is_safe`: the fight is not allowed here or against this one. */
  | { kind: 'refused' }
  /** No such monster in the room. */
  | { kind: 'absent' };

/** The answer in one line of game text (colour already removed), or undefined when the line is not a `consider` answer. */
export function parseConsiderLine(line: string): ConsiderResult | undefined {
  const text = line.trim();
  if (text === "Don't even think about it.") return { kind: 'refused' };
  if (text === "They're not here.") return { kind: 'absent' };
  for (const row of BANDS) {
    const match = row.pattern.exec(text);
    if (match) return { kind: 'band', band: row.band, minDiff: row.min, maxDiff: row.max, name: match[1] };
  }
  return undefined;
}

/**
 * The highest level difference Copilot will start a fight with: the monster up to four levels above the character ("do you feel lucky" is
 * 2 to 4 above). Five or more above ("laughs at you mercilessly", "death will thank you") is never started. This is the rule of the
 * leveling fights; it is a constant so a test and a doc can name it.
 */
export const MAX_FIGHT_LEVEL_DIFF = 4;

/** True when the answer is one a fight may start on (a band whose highest difference is within the limit). */
export function considerAllowsFight(result: ConsiderResult): boolean {
  return result.kind === 'band' && result.maxDiff !== null && result.maxDiff <= MAX_FIGHT_LEVEL_DIFF;
}

/** Plain words for a band, for the prompt and the rationale. */
export const BAND_WORDS: Readonly<Record<ConsiderBand, string>> = {
  naked: 'ten or more levels below you',
  'no-match': '5 to 9 levels below you',
  easy: '2 to 4 levels below you',
  even: 'about your level (1 below to 1 above)',
  lucky: '2 to 4 levels above you',
  laughs: '5 to 9 levels above you',
  death: '10 or more levels above you',
};
