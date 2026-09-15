export type HudLayoutMode = 'classic' | 'compact';

const KEY = 'shatteredArchive.hudLayout.mode.v1';
const VALID: HudLayoutMode[] = ['classic', 'compact'];

export function getHudLayout(): HudLayoutMode {
  try {
    const raw = window.localStorage.getItem(KEY);
    return VALID.includes(raw as HudLayoutMode) ? (raw as HudLayoutMode) : 'classic';
  } catch {
    return 'classic';
  }
}

export function setHudLayout(mode: HudLayoutMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
}
