import {
  applySettingsPatch,
  castVote,
  clearParticipants,
  computeStats,
  createRoom,
  joinRoom,
  resetEstimates,
  setRevealed,
  sweepIdle,
  toRoomView,
  touchParticipant,
} from './room.js';
import type { Room } from './types.js';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function roomWith(names: string[], now = T0): Room {
  let room = createRoom('12345678', 'host-token', now);
  for (const [i, name] of names.entries()) {
    const result = joinRoom(room, { participantId: `p${i}`, participantSecret: `s${i}`, name, now });
    if ('error' in result) throw new Error(result.error);
    room = result.room;
  }
  return room;
}

function vote(room: Room, participantId: string, card: string | null, now = T0): Room {
  const result = castVote(room, participantId, card, now);
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('joinRoom', () => {
  it('adds a participant with a sanitized name', () => {
    const room = roomWith(['  Ada   Lovelace  ']);
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]!.name).toBe('Ada Lovelace');
    expect(room.participants[0]!.vote).toBeNull();
  });

  it('rejects a blank name', () => {
    const room = createRoom('12345678', 'host-token', T0);
    expect(joinRoom(room, { participantId: 'p0', participantSecret: 's0', name: '   ', now: T0 })).toEqual({
      error: 'Enter a name to join.',
    });
  });

  it('re-attaches on a replayed secret instead of duplicating the row, preserving the vote', () => {
    let room = vote(roomWith(['Ada']), 'p0', '5');
    const rejoined = joinRoom(room, {
      participantId: 'fresh-id',
      participantSecret: 'fresh-secret',
      replayedSecret: 's0',
      name: 'Ada',
      now: T0 + 1000,
    });
    if ('error' in rejoined) throw new Error(rejoined.error);
    room = rejoined.room;

    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]!.vote).toBe('5');
    expect(room.participants[0]!.lastActiveAt).toBe(T0 + 1000);
    // The row keeps its original identity; the freshly minted pair is discarded.
    expect(rejoined.participant).toEqual({ id: 'p0', secret: 's0' });
  });

  it('will not let a known participant id stand in for the secret', () => {
    // Participant ids are broadcast to the whole room in every state frame. If one could
    // re-attach, any member could rejoin as a colleague — voting in their name, and reading
    // their hidden estimate, since a viewer is always shown their own card.
    const room = vote(roomWith(['Ada']), 'p0', '5');
    const impostor = joinRoom(room, {
      participantId: 'attacker-id',
      participantSecret: 'attacker-secret',
      replayedSecret: 'p0', // the victim's PUBLIC id, straight off the wire
      name: 'Ada',
      now: T0 + 1000,
    });
    if ('error' in impostor) throw new Error(impostor.error);

    expect(impostor.participant.id).toBe('attacker-id');
    expect(impostor.room.participants).toHaveLength(2);
    // Ada's row is untouched, and the impostor's own row is what they now act as.
    expect(impostor.room.participants.find((p) => p.id === 'p0')?.vote).toBe('5');
    expect(impostor.room.participants.find((p) => p.id === 'attacker-id')?.vote).toBeNull();
    expect(toRoomView(impostor.room, 'attacker-id').participants.find((p) => p.id === 'p0')?.vote).toBeNull();
  });

  it('never puts a participant secret on the wire', () => {
    const view = toRoomView(roomWith(['Ada', 'Grace']), 'p0');
    for (const p of view.participants) {
      expect(p).not.toHaveProperty('secret');
    }
    expect(JSON.stringify(view)).not.toContain('s1');
  });
});

describe('castVote', () => {
  it('rejects a card that is not in the deck', () => {
    const room = roomWith(['Ada']);
    expect(castVote(room, 'p0', '7', T0)).toEqual({ error: 'That card is not in this room’s deck.' });
  });

  it('rejects a vote from someone not in the room', () => {
    const room = roomWith(['Ada']);
    expect(castVote(room, 'ghost', '5', T0)).toEqual({ error: 'You are not in this room.' });
  });

  it('accepts null to clear a vote', () => {
    const room = vote(vote(roomWith(['Ada']), 'p0', '5'), 'p0', null);
    expect(room.participants[0]!.vote).toBeNull();
  });
});

describe('toRoomView hiding', () => {
  it('withholds other people’s votes while unrevealed but keeps hasVoted', () => {
    let room = vote(roomWith(['Ada', 'Grace']), 'p0', '5');
    room = vote(room, 'p1', '8');

    const asAda = toRoomView(room, 'p0');
    expect(asAda.participants.map((p) => p.vote)).toEqual(['5', null]);
    expect(asAda.participants.map((p) => p.hasVoted)).toEqual([true, true]);
    expect(asAda.stats).toBeNull();
  });

  it('reveals every vote and the stats once revealed', () => {
    let room = vote(roomWith(['Ada', 'Grace']), 'p0', '5');
    room = setRevealed(vote(room, 'p1', '8'), true, T0);

    const view = toRoomView(room, 'p0');
    expect(view.participants.map((p) => p.vote)).toEqual(['5', '8']);
    expect(view.stats?.average).toBe(6.5);
  });

  it('shows other votes even unrevealed when hideUntilRevealed is off', () => {
    let room = roomWith(['Ada', 'Grace']);
    const patched = applySettingsPatch(room.settings, { hideUntilRevealed: false });
    if ('error' in patched) throw new Error(patched.error);
    room = { ...room, settings: patched.settings };
    room = vote(vote(room, 'p0', '5'), 'p1', '8');

    expect(toRoomView(room, 'p0').participants.map((p) => p.vote)).toEqual(['5', '8']);
  });

  it('never leaks the host token', () => {
    const view = toRoomView(roomWith(['Ada']), 'p0') as unknown as Record<string, unknown>;
    expect(view.hostToken).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('host-token');
  });
});

describe('computeStats', () => {
  it('excludes non-numeric cards from average and median', () => {
    let room = roomWith(['Ada', 'Grace', 'Alan']);
    room = vote(vote(vote(room, 'p0', '2'), 'p1', '8'), 'p2', '?');

    const stats = computeStats(room);
    expect(stats.average).toBe(5);
    expect(stats.median).toBe(5);
    expect(stats.distribution).toEqual([
      { card: '?', count: 1 },
      { card: '2', count: 1 },
      { card: '8', count: 1 },
    ]);
    expect(stats.consensus).toBe(false);
  });

  it('reports consensus when every voter picked the same card', () => {
    let room = roomWith(['Ada', 'Grace']);
    room = vote(vote(room, 'p0', '3'), 'p1', '3');
    expect(computeStats(room).consensus).toBe(true);
  });

  it('returns null stats when nobody picked a number', () => {
    const room = vote(roomWith(['Ada']), 'p0', '☕');
    const stats = computeStats(room);
    expect(stats.average).toBeNull();
    expect(stats.median).toBeNull();
  });
});

describe('resetEstimates / clearParticipants', () => {
  it('reset clears votes and re-hides but keeps people', () => {
    let room = setRevealed(vote(roomWith(['Ada', 'Grace']), 'p0', '5'), true, T0);
    room = resetEstimates(room, T0);

    expect(room.revealed).toBe(false);
    expect(room.participants).toHaveLength(2);
    expect(room.participants.every((p) => p.vote === null)).toBe(true);
  });

  it('clear empties the roster so everyone re-joins fresh', () => {
    const room = clearParticipants(vote(roomWith(['Ada', 'Grace']), 'p0', '5'), T0);
    expect(room.participants).toEqual([]);
    expect(room.revealed).toBe(false);
  });
});

describe('sweepIdle', () => {
  it('drops only participants idle past the cutoff', () => {
    let room = roomWith(['Ada', 'Grace']);
    room = touchParticipant(room, 'p1', T0 + 59 * 60 * 1000);

    const swept = sweepIdle(room, T0 + HOUR + 1, HOUR);
    expect(swept.participants.map((p) => p.name)).toEqual(['Grace']);
  });

  it('returns the same object when nothing expired (so callers can skip a write)', () => {
    const room = roomWith(['Ada']);
    expect(sweepIdle(room, T0 + 1000, HOUR)).toBe(room);
  });
});

describe('applySettingsPatch', () => {
  it('rejects a deck with fewer than two cards', () => {
    expect(applySettingsPatch(createRoom('1', 'h', T0).settings, { deck: ['1'] })).toEqual({
      error: 'A deck needs at least 2 cards.',
    });
  });

  it('rejects an over-long card', () => {
    const result = applySettingsPatch(createRoom('1', 'h', T0).settings, { deck: ['1', 'enormous'] });
    expect(result).toEqual({ error: 'Card "enormous" is longer than 6 characters.' });
  });

  it('rejects wrongly-typed settings instead of throwing', () => {
    // This function validates records read off DISK as well as websocket frames, and disk data
    // has had nothing vouch for its shape. Throwing here escaped RoomStore's constructor and
    // stopped the server booting.
    const base = createRoom('1', 'h', T0).settings;
    const cases: [unknown, string][] = [
      [{ deck: null }, 'Estimate cards must be a list of text values.'],
      [{ deck: '1,2,3' }, 'Estimate cards must be a list of text values.'],
      [{ deck: ['1', 7] }, 'Estimate cards must be a list of text values.'],
      [{ friendlyName: null }, 'Room name must be text.'],
      [{ friendlyName: 42 }, 'Room name must be text.'],
      [{ hideUntilRevealed: 'yes' }, 'Setting "hideUntilRevealed" must be true or false.'],
      [{ showAverage: 1 }, 'Setting "showAverage" must be true or false.'],
    ];

    for (const [patch, error] of cases) {
      expect(() => applySettingsPatch(base, patch as never)).not.toThrow();
      expect(applySettingsPatch(base, patch as never)).toEqual({ error });
    }
  });

  it('trims the friendly name and keeps unrelated settings', () => {
    const result = applySettingsPatch(createRoom('1', 'h', T0).settings, { friendlyName: '  Team   Rocket ' });
    if ('error' in result) throw new Error(result.error);
    expect(result.settings.friendlyName).toBe('Team Rocket');
    expect(result.settings.hideUntilRevealed).toBe(true);
  });
});
