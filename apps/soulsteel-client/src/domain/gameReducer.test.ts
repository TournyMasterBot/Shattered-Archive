import { computeWinResult, createRoom, reduceRoom, rematchRoom, type RoomAction } from './gameReducer.js';
import type { RoomState } from './types.js';

const NOW = '2026-08-13T00:00:00.000Z';

function apply(state: RoomState, action: RoomAction): RoomState {
  return reduceRoom(state, action, NOW);
}

function withPlayers(names: string[]): { state: RoomState; ids: string[] } {
  let state = createRoom('room-1', NOW);
  for (const name of names) {
    state = apply(state, { type: 'addPlayer', name });
  }
  return { state, ids: state.players.map((p) => p.id) };
}

describe('gameReducer', () => {
  it('assigns roles to players', () => {
    const { state, ids } = withPlayers(['A', 'B']);
    const next = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'cultist-assassin' });
    expect(next.players.find((p) => p.id === ids[0])?.roleId).toBe('cultist-assassin');
    expect(next.players.find((p) => p.id === ids[1])?.roleId).toBeNull();
  });

  it('runs a full night -> day -> execution cycle, tracking elimination causes', () => {
    const { state, ids } = withPlayers(['Assassin', 'Victim', 'Voter']);
    const [assassinId, victimId] = ids;

    let s = apply(state, { type: 'assignRole', playerId: assassinId!, roleId: 'cultist-assassin' });
    s = apply(s, { type: 'assignRole', playerId: victimId!, roleId: 'dark-knight' });
    s = apply(s, { type: 'assignRole', playerId: ids[2]!, roleId: 'dark-knight' });

    // Day 1 -> Night 1
    s = apply(s, { type: 'advanceToNight' });
    expect(s.phase).toBe('night');
    expect(s.dayNumber).toBe(1);

    s = apply(s, { type: 'recordAssassinTarget', targetId: victimId! });
    s = apply(s, { type: 'resolveNight' });

    expect(s.phase).toBe('day');
    expect(s.dayNumber).toBe(2);
    const victim = s.players.find((p) => p.id === victimId)!;
    expect(victim.alive).toBe(false);
    expect(victim.eliminatedAt).toEqual({ day: 1, phase: 'night', cause: 'assassinated' });
    expect(s.timeline).toContainEqual(
      expect.objectContaining({ kind: 'night-elimination', day: 1, targetId: victimId, protected: false }),
    );

    // Day 2: execute the assassin by vote.
    s = apply(s, { type: 'recordVoteTally', tally: { [assassinId!]: 2 } });
    s = apply(s, { type: 'executePlayer', targetId: assassinId! });

    const assassin = s.players.find((p) => p.id === assassinId)!;
    expect(assassin.alive).toBe(false);
    expect(assassin.eliminatedAt).toEqual({ day: 2, phase: 'day', cause: 'executed' });
  });

  it('a Darkshield protection stops the assassination', () => {
    const { state, ids } = withPlayers(['Assassin', 'Shield', 'Target']);
    const [assassinId, shieldId, targetId] = ids;

    let s = apply(state, { type: 'assignRole', playerId: assassinId!, roleId: 'cultist-assassin' });
    s = apply(s, { type: 'assignRole', playerId: shieldId!, roleId: 'darkshield' });
    s = apply(s, { type: 'assignRole', playerId: targetId!, roleId: 'dark-knight' });

    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordNightProtect', protectorId: shieldId!, targetId: targetId! });
    s = apply(s, { type: 'recordAssassinTarget', targetId: targetId! });
    s = apply(s, { type: 'resolveNight' });

    const target = s.players.find((p) => p.id === targetId)!;
    expect(target.alive).toBe(true);
    expect(s.timeline).toContainEqual(
      expect.objectContaining({ kind: 'night-elimination', day: 1, targetId, protected: true }),
    );
  });

  it('a repeated night fact for the same round overwrites rather than accumulates', () => {
    const { state, ids } = withPlayers(['Assassin', 'A', 'B']);
    let s = apply(state, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordAssassinTarget', targetId: ids[1]! });
    s = apply(s, { type: 'recordAssassinTarget', targetId: ids[2]! });

    const targetEntries = s.timeline.filter((e) => e.kind === 'night-assassin-target');
    expect(targetEntries).toHaveLength(1);
    expect(targetEntries[0]).toMatchObject({ targetId: ids[2] });
  });

  it('setPlayerAlive manually kills a living player and logs an admin timeline entry', () => {
    const { state, ids } = withPlayers(['A', 'B']);
    const s = apply(state, { type: 'setPlayerAlive', playerId: ids[0]!, alive: false });

    const player = s.players.find((p) => p.id === ids[0]);
    expect(player?.alive).toBe(false);
    expect(player?.eliminatedAt).toEqual({ day: 1, phase: 'day', cause: 'other' });
    expect(s.timeline).toContainEqual(
      expect.objectContaining({ kind: 'admin-status-change', day: 1, phase: 'day', targetId: ids[0], alive: false }),
    );
  });

  it('setPlayerAlive can revive a dead player, clearing their eliminatedAt', () => {
    const { state, ids } = withPlayers(['A', 'B']);
    let s = apply(state, { type: 'setPlayerAlive', playerId: ids[0]!, alive: false });
    s = apply(s, { type: 'setPlayerAlive', playerId: ids[0]!, alive: true });

    const player = s.players.find((p) => p.id === ids[0]);
    expect(player?.alive).toBe(true);
    expect(player?.eliminatedAt).toBeUndefined();
    const adminEntries = s.timeline.filter((e) => e.kind === 'admin-status-change');
    expect(adminEntries).toHaveLength(2);
    expect(adminEntries[1]).toMatchObject({ alive: true });
  });

  it('setPlayerAlive is a no-op (no state change, no timeline entry) when already in that state', () => {
    const { state, ids } = withPlayers(['A', 'B']);
    const s = apply(state, { type: 'setPlayerAlive', playerId: ids[0]!, alive: true });

    expect(s.players).toEqual(state.players);
    expect(s.timeline).toHaveLength(0);
  });

  it('setPlayerAlive supports multiple simultaneous kills for large-game modifiers', () => {
    const { state, ids } = withPlayers(['A', 'B', 'C']);
    let s = apply(state, { type: 'setPlayerAlive', playerId: ids[0]!, alive: false });
    s = apply(s, { type: 'setPlayerAlive', playerId: ids[1]!, alive: false });

    expect(s.players.filter((p) => p.alive)).toHaveLength(1);
    expect(s.timeline.filter((e) => e.kind === 'admin-status-change')).toHaveLength(2);
  });

  it('setBagCount grows the bag list, preserving role mappings by number', () => {
    const { state } = withPlayers([]);
    let s = apply(state, { type: 'setBagCount', count: 2 });
    s = apply(s, { type: 'assignBagRole', number: 1, roleId: 'umbraseer' });
    s = apply(s, { type: 'setBagCount', count: 3 });

    expect(s.bags).toEqual([
      { number: 1, roleId: 'umbraseer' },
      { number: 2, roleId: null },
      { number: 3, roleId: null },
    ]);
  });

  it('setBagCount shrinks the bag list, dropping mappings for removed numbers', () => {
    const { state } = withPlayers([]);
    let s = apply(state, { type: 'setBagCount', count: 3 });
    s = apply(s, { type: 'assignBagRole', number: 3, roleId: 'darkshield' });
    s = apply(s, { type: 'setBagCount', count: 1 });

    expect(s.bags).toEqual([{ number: 1, roleId: null }]);
  });

  it('setBagContainerKeyword updates the shared bag keyword', () => {
    const { state } = withPlayers([]);
    const s = apply(state, { type: 'setBagContainerKeyword', keyword: 'pouch' });
    expect(s.bagContainerKeyword).toBe('pouch');
  });

  it('setMasterBagKeyword updates the master bag keyword', () => {
    const { state } = withPlayers([]);
    const s = apply(state, { type: 'setMasterBagKeyword', keyword: 'coffer' });
    expect(s.masterBagKeyword).toBe('coffer');
  });

  it('a new room defaults commandDelayMs to 350', () => {
    const { state } = withPlayers([]);
    expect(state.commandDelayMs).toBe(350);
  });

  it('setCommandDelayMs updates the delay, floored and clamped to 0', () => {
    const { state } = withPlayers([]);
    let s = apply(state, { type: 'setCommandDelayMs', delayMs: 500.7 });
    expect(s.commandDelayMs).toBe(500);

    s = apply(s, { type: 'setCommandDelayMs', delayMs: -100 });
    expect(s.commandDelayMs).toBe(0);
  });

  it('removeCustomRole clears any bag mapped to that role, not just players', () => {
    const { state } = withPlayers([]);
    let s = apply(state, {
      type: 'addCustomRole',
      role: { id: 'cultist-minion', name: 'Cultist Minion', alignment: 'assassin', description: 'x' },
    });
    s = apply(s, { type: 'setBagCount', count: 1 });
    s = apply(s, { type: 'assignBagRole', number: 1, roleId: 'cultist-minion' });

    s = apply(s, { type: 'removeCustomRole', roleId: 'cultist-minion' });

    expect(s.bags).toEqual([{ number: 1, roleId: null }]);
  });

});

describe('rematchRoom', () => {
  it('gives the new room a fresh id, same roster, roles/status/timeline cleared, reset to Day 1', () => {
    const { state, ids } = withPlayers(['A', 'B']);
    let s = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'cultist-assassin' });
    s = apply(s, { type: 'assignRole', playerId: ids[1]!, roleId: 'dark-knight' });
    s = apply(s, { type: 'setPlayerAlive', playerId: ids[1]!, alive: false });
    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordAssassinTarget', targetId: ids[1]! });

    const next = rematchRoom(s, 'room-2', NOW);

    expect(next.id).toBe('room-2');
    expect(next.dayNumber).toBe(1);
    expect(next.phase).toBe('day');
    expect(next.timeline).toEqual([]);
    expect(next.players.map((p) => p.id)).toEqual(ids);
    expect(next.players.every((p) => p.roleId === null && p.alive === true && p.eliminatedAt === undefined)).toBe(
      true,
    );
  });

  it('does not modify the source room — the finished match stays intact under its own id', () => {
    const { state, ids } = withPlayers(['A']);
    const s = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'umbraseer' });
    const before: RoomState = JSON.parse(JSON.stringify(s));

    rematchRoom(s, 'room-2', NOW);

    expect(s).toEqual(before);
  });

  it('carries over the bag plan, role catalog, and settings unchanged', () => {
    const { state } = withPlayers(['A']);
    let s = apply(state, { type: 'setBagCount', count: 1 });
    s = apply(s, { type: 'assignBagRole', number: 1, roleId: 'umbraseer' });
    s = apply(s, {
      type: 'addCustomRole',
      role: { id: 'custom-1', name: 'Custom', alignment: 'neutral', description: 'x' },
    });

    const next = rematchRoom(s, 'room-2', NOW);

    expect(next.bags).toEqual([{ number: 1, roleId: 'umbraseer' }]);
    expect(next.roles.some((r) => r.id === 'custom-1')).toBe(true);
    expect(next.settings).toEqual(s.settings);
    expect(next.bagContainerKeyword).toBe(s.bagContainerKeyword);
    expect(next.commandDelayMs).toBe(s.commandDelayMs);
  });
});

describe('computeWinResult', () => {
  it('is null before both alignments are assigned', () => {
    const { state } = withPlayers(['A', 'B']);
    expect(computeWinResult(state)).toBeNull();
  });

  it('Dark Knights win once every Assassin is eliminated', () => {
    // Two Dark Knights, not one: per the rules, Assassins already win the instant living
    // Dark Knights <= living Assassins, so a 1-vs-1 roster would be a win for the Assassins
    // before anything happens. Starting 1-vs-2 keeps the pre-elimination state a non-win.
    const { state, ids } = withPlayers(['Assassin', 'Knight A', 'Knight B']);
    let s = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'cultist-assassin' });
    s = apply(s, { type: 'assignRole', playerId: ids[1]!, roleId: 'dark-knight' });
    s = apply(s, { type: 'assignRole', playerId: ids[2]!, roleId: 'dark-knight' });
    expect(computeWinResult(s)).toBeNull();

    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'resolveNight' }); // no target recorded, nothing dies
    s = apply(s, { type: 'executePlayer', targetId: ids[0]! }); // execute the assassin by day vote
    expect(computeWinResult(s)).toBe('darkKnights');
  });

  it('Assassins win once they equal or outnumber living Dark Knights', () => {
    const { state, ids } = withPlayers(['Assassin', 'Knight']);
    let s = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'cultist-assassin' });
    s = apply(s, { type: 'assignRole', playerId: ids[1]!, roleId: 'dark-knight' });

    s = apply(s, { type: 'advanceToNight' });
    s = apply(s, { type: 'recordAssassinTarget', targetId: ids[1]! });
    s = apply(s, { type: 'resolveNight' });

    expect(computeWinResult(s)).toBe('assassins');
  });

  it('a modifier role opted out of the tally does not count toward either side', () => {
    // Two counted Dark Knights: if the Minion silently counted as an Assassin (the bug this
    // test guards against), 1 Assassin + 1 counted Minion vs 2 Dark Knights would still read as
    // a non-win, masking the bug — so the win check below flips to 'assassins' only by
    // mis-counting a THIRD assassin-aligned player, which the Minion must not be.
    const { state, ids } = withPlayers(['Assassin', 'Minion', 'Knight A', 'Knight B']);
    let s = apply(state, { type: 'assignRole', playerId: ids[0]!, roleId: 'cultist-assassin' });
    s = apply(s, {
      type: 'addCustomRole',
      role: {
        id: 'cultist-minion',
        name: 'Cultist Minion',
        alignment: 'assassin',
        description: 'Serves the Assassins without being counted as one.',
        countsTowardWinTally: false,
      },
    });
    s = apply(s, { type: 'assignRole', playerId: ids[1]!, roleId: 'cultist-minion' });
    s = apply(s, { type: 'assignRole', playerId: ids[2]!, roleId: 'dark-knight' });
    s = apply(s, { type: 'assignRole', playerId: ids[3]!, roleId: 'dark-knight' });

    // 1 counted Assassin, 2 counted Dark Knights, 1 uncounted Minion — not a majority.
    expect(computeWinResult(s)).toBeNull();
  });
});
