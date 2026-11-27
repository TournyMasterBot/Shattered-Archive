import { normalizeSettings, settingsEqual, toStored, type TrustSettings } from '@shatteredarchive/copilot-core';

export const SETTINGS_KEY = 'copilot.settings.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SettingsStore {
  /** The live settings. Treat as read-only. */
  get(): TrustSettings;
  /** The editor's write. Anything is accepted and normalised. */
  set(next: unknown): TrustSettings;
  /** The reset button: the live copy becomes the defaults at once, no reload (SETTINGS-03). */
  reset(): TrustSettings;
  subscribe(listener: (settings: TrustSettings) => void): () => void;
  /** The cross-tab `storage` event. */
  onStorageEvent(event: { key: string | null; newValue: string | null }): void;
}

/**
 * The Copilot trust settings in localStorage under `copilot.settings.v1`.
 *
 * - ONE write path (SETTINGS-04): the editor, the reset button and the `storage` event all go through `apply`, which normalises with
 *   copilot-core, notifies, and (for the first two) stores only the values that differ from the defaults (SETTINGS-01/02). The stored
 *   key is removed when nothing differs.
 * - Fail-safe: a blocked storage, or a stored value that is not JSON, gives the defaults. The one warning each can raise says nothing
 *   about the stored values.
 */
export function createSettingsStore(storage: KeyValueStorage | undefined, warn: (message: string) => void = (m) => console.warn(m)): SettingsStore {
  const listeners = new Set<(settings: TrustSettings) => void>();
  let warnedCorrupt = false;
  let warnedStorage = false;

  const warnCorrupt = (): void => {
    if (warnedCorrupt) return;
    warnedCorrupt = true;
    warn('[copilot] stored settings could not be read; using the defaults');
  };
  const warnStorage = (): void => {
    if (warnedStorage) return;
    warnedStorage = true;
    warn('[copilot] settings storage is not available; changes last until the page closes');
  };

  function parse(text: string | null): unknown {
    if (text === null) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      warnCorrupt();
      return undefined;
    }
  }

  function load(): unknown {
    try {
      return parse(storage?.getItem(SETTINGS_KEY) ?? null);
    } catch {
      warnStorage();
      return undefined;
    }
  }

  let current = normalizeSettings(load());

  function apply(raw: unknown, persist: boolean): TrustSettings {
    const next = normalizeSettings(raw);
    if (persist) {
      // written even when nothing changed, so a corrupt stored value is replaced by what the editor now shows
      try {
        const stored = toStored(next);
        if (stored === null) storage?.removeItem(SETTINGS_KEY);
        else storage?.setItem(SETTINGS_KEY, JSON.stringify(stored));
      } catch {
        warnStorage();
      }
    }
    if (settingsEqual(next, current)) return current;
    current = next;
    for (const listener of [...listeners]) listener(current);
    return current;
  }

  return {
    get: () => current,
    set: (next) => apply(next, true),
    reset: () => apply(undefined, true),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onStorageEvent(event) {
      if (event.key !== null && event.key !== SETTINGS_KEY) return; // another key; `null` is storage.clear()
      apply(parse(event.key === null ? null : event.newValue), false);
    },
  };
}
