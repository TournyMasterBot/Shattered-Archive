import { getHudLayout, setHudLayout } from './hudLayoutStore';

const KEY = 'shatteredArchive.hudLayout.mode.v1';

describe('hudLayoutStore', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));

  it('defaults to classic when nothing is stored', () => {
    expect(getHudLayout()).toBe('classic');
  });

  it('round-trips compact', () => {
    setHudLayout('compact');
    expect(getHudLayout()).toBe('compact');
  });

  it('ignores a corrupt stored value and falls back to classic', () => {
    window.localStorage.setItem(KEY, 'not-a-real-mode');
    expect(getHudLayout()).toBe('classic');
  });
});
