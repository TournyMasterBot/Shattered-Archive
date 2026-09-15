export type HudTheme = 'default' | 'slate-amber';

const KEY = 'shatteredArchive.hudLayout.theme.v1';
const VALID: HudTheme[] = ['default', 'slate-amber'];

export function getHudTheme(): HudTheme {
  try {
    const raw = window.localStorage.getItem(KEY);
    return VALID.includes(raw as HudTheme) ? (raw as HudTheme) : 'default';
  } catch {
    return 'default';
  }
}

export function setHudTheme(theme: HudTheme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
}
