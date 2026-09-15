import { getHudTheme, setHudTheme } from './hudThemeStore';

const KEY = 'shatteredArchive.hudLayout.theme.v1';

describe('hudThemeStore', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));

  it('defaults to default when nothing is stored', () => {
    expect(getHudTheme()).toBe('default');
  });

  it('round-trips slate-amber', () => {
    setHudTheme('slate-amber');
    expect(getHudTheme()).toBe('slate-amber');
  });

  it('ignores a corrupt stored value and falls back to default', () => {
    window.localStorage.setItem(KEY, 'not-a-real-theme');
    expect(getHudTheme()).toBe('default');
  });
});
