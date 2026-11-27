import type { GameState, Lesson, Mode } from '@shatteredarchive/copilot-core';
import type { Situation } from '../suggest/situation';

/** A situation for tests: connected, in a market square, not fighting. Test helper: excluded from the build. */
export function makeSituation(overrides: Partial<Omit<Situation, 'game'>> & { game?: Partial<GameState> } = {}): Situation {
  const { game, ...rest } = overrides;
  const mode: Mode = rest.mode ?? 'exploration';
  return {
    character: 'Agate-F',
    mode,
    game: {
      connected: true,
      inFight: false,
      room: { name: 'Market Square', sector: 'city', exits: ['N', 'E'] },
      vitals: { hp: 90, maxHp: 100, mana: 50, maxMana: 60, move: 80, maxMove: 90 },
      lastEventAt: 1_000,
      lastTextAt: 1_000,
      ...game,
    },
    lines: ['You are standing in a busy square.'],
    now: 1_000,
    situationKey: mode === 'battle' ? 'battle:fight' : `${mode}:market-square`,
    ...rest,
  };
}

export function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l-1',
    createdAt: 5,
    sphere: 'world',
    situationKey: 'exploration:market-square',
    scope: 'shared',
    world: 'dsl',
    rule: 'Read the board before leaving.',
    sourceDecisionId: 'd-1',
    status: 'accepted',
    ...overrides,
  };
}
