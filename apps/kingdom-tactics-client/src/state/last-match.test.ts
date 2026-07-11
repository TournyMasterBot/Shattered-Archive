import { saveLastMatch, loadLastMatch, clearLastMatch } from './last-match';
import type { MatchStartPayload } from './nav';

const payload: MatchStartPayload = {
  modeId: 'skirmish',
  seed: 1,
  terrain: 'authored',
  rosters: [
    { side: 0, name: 'You', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
    { side: 1, name: 'Opponent 1', picks: [{ raceKey: 'Human', classKey: 'Warrior' }] },
  ],
};

beforeEach(() => globalThis.localStorage.clear());

describe('last-match', () => {
  it('returns null when nothing is stored', () => {
    expect(loadLastMatch()).toBeNull();
  });

  it('round-trips a payload and can be cleared', () => {
    saveLastMatch(payload);
    expect(loadLastMatch()).toEqual(payload);
    clearLastMatch();
    expect(loadLastMatch()).toBeNull();
  });
});
