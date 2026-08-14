import { createRoom, reduceRoom } from './gameReducer.js';
import type { RoomAction } from './gameReducer.js';
import type { RoomState } from './types.js';
import { isUmbraseerBlocked } from './umbraseerBlock.js';

const NOW = '2026-08-13T00:00:00.000Z';

function apply(state: RoomState, action: RoomAction): RoomState {
  return reduceRoom(state, action, NOW);
}

function baseRoom(): { state: RoomState; ids: string[] } {
  let state = createRoom('r1', NOW);
  for (const name of ['Shield', 'Cultist', 'Knight']) {
    state = apply(state, { type: 'addPlayer', name });
  }
  const ids = state.players.map((p) => p.id);
  state = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'darkshield' });
  state = apply(state, { type: 'assignRole', playerId: ids[1]!, roleId: 'cultist-assassin' });
  state = apply(state, { type: 'assignRole', playerId: ids[2]!, roleId: 'dark-knight' });
  return { state, ids };
}

describe('isUmbraseerBlocked', () => {
  it('is false when the setting is off, even if the Darkshield protected the Assassin', () => {
    const { state, ids } = baseRoom();
    let s = apply(state, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordNightProtect', protectorId: ids[0]!, targetId: ids[1]! });
    expect(isUmbraseerBlocked(s, 1)).toBe(false);
  });

  it('is true when the setting is on and the Darkshield protected an Assassin-aligned player', () => {
    const { state, ids } = baseRoom();
    let s = apply(state, { type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: true } });
    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordNightProtect', protectorId: ids[0]!, targetId: ids[1]! });
    expect(isUmbraseerBlocked(s, 1)).toBe(true);
  });

  it('is false when the setting is on but the Darkshield protected a non-Assassin', () => {
    const { state, ids } = baseRoom();
    let s = apply(state, { type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: true } });
    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordNightProtect', protectorId: ids[0]!, targetId: ids[2]! });
    expect(isUmbraseerBlocked(s, 1)).toBe(false);
  });

  it('is false when no protection was recorded for that night', () => {
    const { state } = baseRoom();
    let s = apply(state, { type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: true } });
    s = apply(s, { type: 'advanceToNight' });
    expect(isUmbraseerBlocked(s, 1)).toBe(false);
  });

  it('does not leak into a different night', () => {
    const { state, ids } = baseRoom();
    let s = apply(state, { type: 'updateSettings', settings: { darkshieldBlocksUmbraseer: true } });
    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordNightProtect', protectorId: ids[0]!, targetId: ids[1]! });
    expect(isUmbraseerBlocked(s, 2)).toBe(false);
  });
});
