import { getHudThemeId, setHudThemeId } from './hudThemeStore';

const KEY = 'shatteredArchive.hudTheme.id.v1';

describe('hudThemeStore', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));

  it('defaults to default when nothing is stored', () => {
    expect(getHudThemeId()).toBe('default');
  });

  it('round-trips slate-amber', () => {
    setHudThemeId('slate-amber');
    expect(getHudThemeId()).toBe('slate-amber');
  });

  it('ignores a corrupt stored value and falls back to default', () => {
    window.localStorage.setItem(KEY, 'not-a-real-theme');
    expect(getHudThemeId()).toBe('default');
  });
});
