import { THEME_REGISTRY, resolveActiveTheme } from './themeRegistry';

describe('resolveActiveTheme', () => {
  it('resolves default to its own shell regardless of viewport width', () => {
    expect(resolveActiveTheme('default', 1440).theme.id).toBe('default');
    expect(resolveActiveTheme('default', 600).theme.id).toBe('default');
  });

  it('resolves slate-amber to its own shell at desktop widths', () => {
    const resolved = resolveActiveTheme('slate-amber', 1440);
    expect(resolved.theme.id).toBe('slate-amber');
    expect(resolved.ShellComponent).toBe(THEME_REGISTRY['slate-amber'].ShellComponent);
    expect(resolved.isNarrow).toBe(false);
  });

  it('resolves slate-amber to ITS OWN narrow shell (and styles) below its breakpoint, not a fallback to default', () => {
    const resolved = resolveActiveTheme('slate-amber', 600);
    expect(resolved.theme.id).toBe('slate-amber');
    expect(resolved.ShellComponent).toBe(THEME_REGISTRY['slate-amber'].NarrowShellComponent);
    expect(resolved.ShellComponent).not.toBe(THEME_REGISTRY['slate-amber'].ShellComponent);
    expect(resolved.isNarrow).toBe(true);
  });

  it('falls back to default (shell and styles) for a theme with no NarrowShellComponent of its own', () => {
    // Proves the generic fallback path itself still works, for whichever
    // future theme doesn't define a narrow variant — exercised here by
    // temporarily removing slate-amber's, not a hypothetical.
    const real = THEME_REGISTRY['slate-amber'].NarrowShellComponent;
    delete THEME_REGISTRY['slate-amber'].NarrowShellComponent;
    try {
      const resolved = resolveActiveTheme('slate-amber', 600);
      expect(resolved.theme.id).toBe('default');
      expect(resolved.ShellComponent).toBe(THEME_REGISTRY.default.ShellComponent);
      expect(resolved.isNarrow).toBe(true);
    } finally {
      THEME_REGISTRY['slate-amber'].NarrowShellComponent = real;
    }
  });

  it('treats exactly the breakpoint width as narrow (matches the original > 900 desktop check)', () => {
    expect(resolveActiveTheme('slate-amber', 900).isNarrow).toBe(true);
    expect(resolveActiveTheme('slate-amber', 901).isNarrow).toBe(false);
  });

  it('falls back to default for an unknown/corrupt theme id', () => {
    const resolved = resolveActiveTheme('not-a-real-theme' as never, 1440);
    expect(resolved.theme.id).toBe('default');
  });
});

describe('loadStyles', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-hud-theme');
  });

  it("sets data-hud-theme to the theme's own id, for every registered theme", () => {
    THEME_REGISTRY.default.loadStyles?.();
    expect(document.documentElement.getAttribute('data-hud-theme')).toBe('default');

    THEME_REGISTRY['slate-amber'].loadStyles?.();
    expect(document.documentElement.getAttribute('data-hud-theme')).toBe('slate-amber');
  });
});
