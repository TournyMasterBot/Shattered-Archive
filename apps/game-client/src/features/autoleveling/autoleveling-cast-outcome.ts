// apps/game-client/src/features/autoleveling/autoleveling-cast-outcome.ts

/**
 * What the game answers to a cast, read from its text. Only lines seen in the game-server logs of 2026-11-14 and 2026-11-18 are here (counts per
 * day in the work item's scope.md); an ability with no recognisable line is confirmed by its GMCP affect, or not at all.
 */

export type FailureOutcome = 'failed' | 'no-mana' | 'not-fighting' | 'no-item';

/** What a cast turned out to be: `set` (the affect or the success line showed), a failure, no word in the window, or the run stopped. */
export type CastOutcome = FailureOutcome | 'set' | 'timeout' | 'stopped';

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** One line of game text as the matchers see it: no colour codes, lowercase, single spaces, no final dot. */
export function plainLine(raw: string): string {
  return String(raw ?? '')
    .replace(ANSI, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

const FAILURES: readonly (readonly [string, FailureOutcome])[] = [
  // the spell fizzled: worth trying again (68 times on 2026-11-14, 32 on 2026-11-18)
  ['you lost your concentration', 'failed'],
  // not enough mana: trying again at once cannot help
  ["you can't concentrate enough", 'no-mana'],
  // an attack spell cast out of combat
  ["you aren't fighting anyone", 'not-fighting'],
  // the item is gone from the inventory
  ['you do not have that potion', 'no-item'],
];

/** The failure a line reports, or null. Each text chunk can hold several lines; callers split on line breaks first. */
export function classifyFailureLine(raw: string): FailureOutcome | null {
  const line = plainLine(raw);
  for (const [text, outcome] of FAILURES) if (line === text) return outcome;
  return null;
}

/** True when the line is the ability's own success line (given lowercase and without a final dot, as the catalog stores it). */
export function isSuccessLine(raw: string, successLine: string | undefined): boolean {
  return !!successLine && plainLine(raw) === successLine.toLowerCase();
}
