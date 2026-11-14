// apps/copilot-server/src/suggest/hintFacts.ts
//
// Copilot's regular use of the hint tiers: for the room the character stands in, ask the tier engine (learned, instant, local, escalate) and give the producer a
// few short lines it can read ("Hint (instant): look fountain | drink fountain"). The room text comes from the recent game lines the producer already has,
// so the `hint` command is consulted every time Copilot suggests something in a room, not only when a person types it.

import type { HintEngine } from '../hints/engine.js';
import type { HintAnswer, HintRoom } from '../hints/types.js';
import type { Situation } from './situation.js';

const MAX_DESCRIPTION = 2000;

/**
 * The room the situation is in: its name, exits and sector from the game state, and its description from the recent lines (the lines after the room name,
 * up to the exits line). Undefined when there is no room, or the character is fighting (a fight is not the time for a hint).
 */
export function roomFromSituation(situation: Situation): HintRoom | undefined {
  const room = situation.game.room;
  if (room === undefined || room === null || situation.game.inFight) return undefined;
  const name = room.name.trim();
  if (name === '') return undefined;
  const key = name.toLowerCase();

  let description: string | undefined;
  for (let i = situation.lines.length - 1; i >= 0; i--) {
    if (situation.lines[i].trim().toLowerCase() !== key) continue;
    const text: string[] = [];
    for (let j = i + 1; j < situation.lines.length; j++) {
      const line = situation.lines[j].trim();
      if (/^\[exits:/i.test(line)) break;
      if (line !== '') text.push(line);
    }
    if (text.length > 0) description = text.join(' ').slice(0, MAX_DESCRIPTION);
    break;
  }
  return { title: name, exits: [...room.exits], sector: room.sector, ...(description === undefined ? {} : { description }) };
}

const TIER_LABEL: Record<HintAnswer['tier'], string> = {
  learned: 'taught',
  instant: 'instant',
  local: 'local model',
  escalated: 'none yet',
  none: 'none',
};

/** The answer as lines for the prompt. Nothing at all for an answer with no commands, except that an escalation is said once. */
export function formatHintFacts(answer: HintAnswer): string[] {
  if (answer.commands.length === 0) {
    return answer.tier === 'escalated' ? ['No hint for this room yet from any tier; a ticket was filed so it can be answered (do not invent commands for it).'] : [];
  }
  return [`Hint (${TIER_LABEL[answer.tier]}): ${answer.commands.join(' | ')}`, ...answer.notes.slice(0, 2).map((n) => `Hint note: ${n}`)];
}

/** The hints function the router takes: facts for the room of the situation, from the first tier that can answer. */
export function createHintFacts(engine: HintEngine): (situation: Situation, signal?: AbortSignal) => Promise<string[]> {
  return async (situation, signal) => {
    const room = roomFromSituation(situation);
    if (room === undefined) return [];
    return formatHintFacts(await engine.hint(room, signal));
  };
}
