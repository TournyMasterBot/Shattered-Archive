import { applyHudTheme } from './hudThemeLoader';

describe('applyHudTheme', () => {
  afterEach(() => {
    document.getElementById('hud-theme-style')?.remove();
  });

  it('injects a stylesheet link for slate-amber', () => {
    applyHudTheme('slate-amber');
    const link = document.getElementById('hud-theme-style') as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link!.rel).toBe('stylesheet');
    expect(link!.href).toContain('/themes/slate-amber.css');
  });

  it('removes the stylesheet link for default', () => {
    applyHudTheme('slate-amber');
    expect(document.getElementById('hud-theme-style')).not.toBeNull();

    applyHudTheme('default');
    expect(document.getElementById('hud-theme-style')).toBeNull();
  });

  it('is idempotent when called twice with the same theme', () => {
    applyHudTheme('slate-amber');
    applyHudTheme('slate-amber');
    expect(document.querySelectorAll('#hud-theme-style').length).toBe(1);
  });
});
