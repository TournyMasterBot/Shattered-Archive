// apps/game-client/src/features/autoleveling/autoleveling-enemy-condition.ts

/**
 * The enemy's condition as the game words it. GMCP `char_data` carries the player's own hit points and `is_fighting` but nothing about the
 * enemy, so the only source is the text line the game prints each round (`<enemy> has some big nasty wounds and scratches.`): seven
 * phrases, each a band of the enemy's hit points. Counted in the game-server logs of 2026-11-14 and 2026-11-18 (thousands of each phrase).
 *
 * The band edges are the stock base's (merc-mud `act_info.c`: 100, 90, 75, 50, 30, 15, 0). DSL is a third-party game and its edges are NOT
 * verified, so everything shown to the player says "about" (docs/game/autopilot.md, "Gates").
 */

import type { AutoLevelEnemyBand } from './autoleveling-types';

export interface ConditionBand {
  /** The phrase after the creature's name, lowercase, without the final dot. */
  phrase: string;
  /** Lower edge of the band in percent (the band is "from this much up to the next band"). */
  floor: AutoLevelEnemyBand;
  /** The phrase as a menu label. */
  label: string;
}

/** Best condition first. "is bleeding to death" (below 0) shares the lowest band: no gate can tell it from "awful". */
export const CONDITION_BANDS: readonly ConditionBand[] = [
  { phrase: 'is in excellent condition', floor: 100, label: 'is in excellent condition' },
  { phrase: 'has a few scratches', floor: 90, label: 'has a few scratches' },
  { phrase: 'has some small wounds and bruises', floor: 75, label: 'has some wounds and bruises' },
  { phrase: 'has quite a few wounds', floor: 50, label: 'has quite a few wounds' },
  { phrase: 'has some big nasty wounds and scratches', floor: 30, label: 'has some big nasty wounds and scratches' },
  { phrase: 'looks pretty hurt', floor: 15, label: 'looks pretty hurt' },
  { phrase: 'is in awful condition', floor: 0, label: 'is in awful condition' },
  { phrase: 'is bleeding to death', floor: 0, label: 'is bleeding to death' },
];

/** The phrase of a band with its percent after it: "has quite a few wounds (about 50%)". */
export function bandLabel(floor: AutoLevelEnemyBand): string {
  const band = CONDITION_BANDS.find((b) => b.floor === floor);
  return `${band?.label ?? 'unknown'} (about ${floor}%)`;
}

export interface ParsedCondition {
  /** Who the line is about, as the game wrote it, trimmed (may be empty when the phrase starts the line). */
  subject: string;
  floor: AutoLevelEnemyBand;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

const PHRASE_PATTERN = new RegExp(
  `^(.*?)\\s*(${CONDITION_BANDS.map((b) => b.phrase.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'i',
);

/**
 * Every condition line in a chunk of game text, in order. ANSI is removed first, matching is case-insensitive, and a phrase has to be
 * whole on its line: a chunk that ends in the middle of a phrase gives no match (the rest of it arrives in the next chunk as a
 * different line and is not read as a condition).
 */
export function parseEnemyCondition(text: string): ParsedCondition[] {
  const out: ParsedCondition[] = [];
  for (const raw of String(text ?? '').replace(ANSI, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = PHRASE_PATTERN.exec(line);
    if (!m) continue;
    const phrase = m[2].toLowerCase().replace(/\s+/g, ' ');
    const band = CONDITION_BANDS.find((b) => b.phrase === phrase);
    if (!band) continue;
    out.push({ subject: m[1].trim(), floor: band.floor });
  }
  return out;
}
