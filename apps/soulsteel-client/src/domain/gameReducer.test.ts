import { computeWinResult, createRoom, reduceRoom, type RoomAction } from './gameReducer.js';
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
