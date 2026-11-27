import type { KeyValueStorage } from './settings';

type SwitchStorage = Pick<KeyValueStorage, 'getItem' | 'setItem'>;

/** Where the owner's on/off choice is kept in this browser. */
export const ENABLED_KEY = 'copilot.enabled.v1';

/**
 * Copilot's switch. It starts OFF in every browser and stays off until the owner turns it on: only the exact stored text `true` counts
 * as on, so a missing, damaged or blocked value is off. The page, the window and the command gate read the same store, so a change
 * is seen by all of them at once, and (through the `storage` event) by the other tabs.
 */
export interface EnabledStore {
  get(): boolean;
  set(on: boolean): void;
  subscribe(listener: (on: boolean) => void): () => void;
  /** Wire this to the window's `storage` event: another tab changed the switch. */
  onStorageEvent(event: { key: string | null; newValue: string | null }): void;
}

export function createEnabledStore(storage: SwitchStorage | undefined): EnabledStore {
  let current = read(storage);
  const listeners = new Set<(on: boolean) => void>();

  function change(next: boolean): void {
    if (next === current) return;
    current = next;
    for (const listener of [...listeners]) listener(current);
  }

  return {
    get: () => current,
    set(on) {
      try {
        storage?.setItem(ENABLED_KEY, on ? 'true' : 'false');
      } catch {
        // a blocked or full storage: the choice lasts until the page closes
      }
      change(on);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onStorageEvent(event) {
      // `key` is null when the whole storage was cleared: that is back to the default, off
      if (event.key === null) change(false);
      else if (event.key === ENABLED_KEY) change(event.newValue === 'true');
    },
  };
}

function read(storage: SwitchStorage | undefined): boolean {
  try {
    return storage?.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}
