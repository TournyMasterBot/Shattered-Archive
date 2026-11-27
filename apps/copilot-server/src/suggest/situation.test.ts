import type { GameState } from '@shatteredarchive/copilot-core';
import type { RingEvent } from '../tail/pipeline';
import { inferMode, recentLines, situationKeyFor } from './situation';

const game = (over: Partial<GameState> = {}): GameState => ({ connected: true, inFight: false, room: { name: 'The Grand  Market, Square!', sector: 'city', exits: [] }, ...over });
const lines = (...l: string[]): RingEvent => ({ type: 'lines', at: 1, lines: l });

describe('inferMode', () => {
  it('is battle in a fight and exploration otherwise', () => {
    expect(inferMode(game({ inFight: true }))).toBe('battle');
    expect(inferMode(game())).toBe('exploration');
  });
});

describe('situationKeyFor', () => {
  it('is the mode and the room name as dashes', () => {
    expect(situationKeyFor('exploration', game())).toBe('exploration:the-grand-market-square');
    expect(situationKeyFor('questing', game())).toBe('questing:the-grand-market-square');
  });

  it('is one key for every fight, whatever the room', () => {
    expect(situationKeyFor('battle', game({ inFight: true }))).toBe('battle:fight');
  });

  it('copes with no room, a room name with no letters, and a very long name', () => {
    expect(situationKeyFor('exploration', game({ room: undefined }))).toBe('exploration:unknown-room');
    expect(situationKeyFor('exploration', game({ room: { name: '!!!', sector: '', exits: [] } }))).toBe('exploration:unknown-room');
    expect(situationKeyFor('exploration', game({ room: { name: 'a'.repeat(500), sector: '', exits: [] } })).length).toBe(200);
  });
});

describe('recentLines', () => {
  const upper = (t: string): string => t.toUpperCase();

  it('takes the newest lines, oldest first, without colour or blanks, through redact', () => {
    const events: RingEvent[] = [lines('old one', 'old two'), { type: 'command', at: 2, command: 'look' }, lines('\x1b[1;31mred\x1b[0m line', '   ', 'last')];
    expect(recentLines(events, 3, upper)).toEqual(['OLD TWO', 'RED LINE', 'LAST']);
    expect(recentLines(events, 10, upper)).toEqual(['OLD ONE', 'OLD TWO', 'RED LINE', 'LAST']);
  });

  it('is empty when there is no text, and cuts a very long line', () => {
    expect(recentLines([], 5, upper)).toEqual([]);
    expect(recentLines([{ type: 'room', at: 1, room: 'A', sector: '', exits: [] }], 5, upper)).toEqual([]);
    expect(recentLines([lines('x'.repeat(1000))], 5, upper)[0]).toHaveLength(300);
    expect(recentLines([lines('a', 'b')], 0, upper)).toEqual([]);
  });
});
