import { MODES, isMode, type Mode } from '@shatteredarchive/copilot-core';

export const MODE_STORAGE_KEY = 'copilot.mode.v1';
export const DEFAULT_MODE: Mode = 'exploration';
export const MODE_LABELS: Record<Mode, string> = { battle: 'Battle', exploration: 'Exploration', questing: 'Questing', leveling: 'Leveling' };
export { MODES };

/** The saved mode, or the default when nothing valid is saved or storage is blocked. */
export function loadMode(storage: Pick<Storage, 'getItem'> | undefined): Mode {
  try {
    const value = storage?.getItem(MODE_STORAGE_KEY);
    return isMode(value) ? value : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Remember the mode. A blocked storage is ignored (the choice lasts until the page closes). */
export function saveMode(storage: Pick<Storage, 'setItem'> | undefined, mode: Mode): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}
