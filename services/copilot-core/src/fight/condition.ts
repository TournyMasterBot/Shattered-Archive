/**
 * How hurt a creature looks, in the game's words.
 *
 * `merc-mud/2.4/src/comm.c` (the battle prompt, every pulse of a fight) and `act_info.c` (looking at a creature) turn the creature's hit
 * points into one of eight sentences by percent: `percent = hit * 100 / max_hit`. A player never sees the numbers, only the sentence, so the
 * best a reader can do is a range of percent for it. This module owns that table and nothing else.
 *
 * Pure and dependency-free.
 */

interface Row {
  /** Lowest and highest percent the sentence can mean (a creature below 0 hit points is `bleeding`). */
  min: number;
  max: number;
  text: string;
}

/** In the game's order, healthiest first. 100 is only exactly full health; 99 is already "a few scratches". */
export const CONDITION_ROWS: readonly Row[] = [
  { min: 100, max: 100, text: 'is in excellent condition.' },
  { min: 90, max: 99, text: 'has a few scratches.' },
  { min: 75, max: 89, text: 'has some small wounds and bruises.' },
  { min: 50, max: 74, text: 'has quite a few wounds.' },
  { min: 30, max: 49, text: 'has some big nasty wounds and scratches.' },
  { min: 15, max: 29, text: 'looks pretty hurt.' },
  { min: 0, max: 14, text: 'is in awful condition.' },
  { min: -100, max: -1, text: 'is bleeding to death.' },
];

export interface Condition {
  /** The creature as the line names it (`PERS`/`short_descr`, first letter upper case). */
  name: string;
  /** What percent of its hit points the creature has left, as a range. */
  minPct: number;
  maxPct: number;
}

/** The condition in one line of game text (colour removed), or undefined when the line is not one. */
export function parseConditionLine(line: string): Condition | undefined {
  const text = line.trim();
  for (const row of CONDITION_ROWS) {
    if (!text.endsWith(` ${row.text}`)) continue;
    // the line is trimmed and ends with a space before the sentence, so there is always a name
    return { name: text.slice(0, text.length - row.text.length - 1).trim(), minPct: row.min, maxPct: row.max };
  }
  return undefined;
}

/** The middle of a range, for estimates; a creature that is `bleeding` counts as 0. */
export function midPct(condition: Pick<Condition, 'minPct' | 'maxPct'>): number {
  return Math.max(0, (condition.minPct + condition.maxPct) / 2);
}
