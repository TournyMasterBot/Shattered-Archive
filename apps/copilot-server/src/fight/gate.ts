import { gateFight, type FightGate } from '@shatteredarchive/copilot-core';
import type { World } from '../world/worlds.js';
import type { Situation } from '../suggest/situation.js';
import type { MonsterLookup } from './monsterLookup.js';
import type { FightWatch } from './watch.js';

/** What the producer does with a command the model proposed. */
export type FightGateOutcome =
  /** Nothing to change. */
  | { action: 'allow' }
  /** Propose this safe command instead (a `consider`), and say why. */
  | { action: 'replace'; command: string; rationale: string }
  /** Propose nothing: the fight must not start. */
  | { action: 'hold'; rationale: string };

export interface FightGateDeps {
  watch: FightWatch;
  /** The world of the current connection. */
  world: () => World | undefined;
  /** The archive lookup for a monster; absent when there is no archive configured. */
  monsterLookup?: MonsterLookup;
  now: () => number;
}

export type FightGateFn = (situation: Situation, command: string, signal?: AbortSignal) => Promise<FightGateOutcome>;

/**
 * Puts the rule into practice for each command the model proposes: a fight is never started on a monster that has not been looked up in the
 * archive through the MCP and, when the archive cannot name it, `consider`ed in the game and read. The pure decision is `gateFight`
 * (copilot-core); this does the two things it cannot: ask the archive, and record the answer.
 *
 * The archive is the DSL's. The Simulacrum is another game, so its monsters are never asked there (a name that happens to exist in both would
 * give the wrong level): in that world the first step is `consider`.
 */
export function createFightGate(deps: FightGateDeps): FightGateFn {
  return async (situation, command, signal) => {
    const room = situation.game.room?.name ?? '';
    const world = deps.world();
    const lookupAvailable = deps.monsterLookup !== undefined && world === 'dsl';
    const decide = (): FightGate =>
      gateFight({ command, room, inFight: situation.game.inFight, now: deps.now(), knowledge: deps.watch.knowledge, lookupAvailable });

    let gate = decide();
    if (gate.action === 'lookup') {
      const outcome = await (deps.monsterLookup as MonsterLookup)(gate.target, signal);
      deps.watch.knowledge.recordLookup(room, gate.target, outcome, deps.now());
      gate = decide();
    }
    switch (gate.action) {
      case 'consider':
        return { action: 'replace', command: gate.command, rationale: `${gate.reason}. The rule: never start a fight before the monster is identified.` };
      case 'deny':
        return { action: 'hold', rationale: gate.reason };
      default:
        // allow; a `lookup` here cannot happen: the answer was recorded and the next decision reads it
        return { action: 'allow' };
    }
  };
}
