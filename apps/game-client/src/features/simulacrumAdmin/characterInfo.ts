import type { GmcpCapture } from './gmcpCapture';

/**
 * What the panel knows about the connected character, taken from GMCP `login_data` (sent once per login). Memory only, and cleared when
 * the connection leaves the simulacrum. The character's NAME is deliberately not kept: it is Personal data and the panel has no use for it;
 * the level is what the window shows and what the Commands tab uses to guess which commands the character can run.
 */
export interface CharacterInfo {
  /** The character's level. It is not the trust: `trust` can raise the trust above the level, so `wizhelp` stays the authority on commands. */
  level?: number;
  inClan: boolean;
  /** The game clock at login, "3:30pm". */
  gameTime?: string;
}

export interface CharacterInfoStore {
  /** The same object until something changes. */
  getState(): CharacterInfo;
  subscribe(listener: () => void): () => void;
  clear(): void;
  dispose(): void;
}

const EMPTY: CharacterInfo = Object.freeze({ inClan: false }) as CharacterInfo;

function isLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000;
}

/** The info a `login_data` payload carries, or undefined when it is not a usable one (the previous info is then kept). */
export function characterInfoFromLogin(data: unknown): CharacterInfo | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (!isLevel(record.level)) return undefined;
  return {
    level: record.level,
    inClan: record.is_clan === true,
    ...(typeof record.time === 'string' ? { gameTime: record.time } : {}),
  };
}

export function createCharacterInfo(capture: GmcpCapture): CharacterInfoStore {
  let state: CharacterInfo = EMPTY;
  const listeners = new Set<() => void>();
  const set = (next: CharacterInfo): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const stop = capture.onMessage((entry) => {
    if (entry.pkg !== 'login_data') return;
    const info = characterInfoFromLogin(entry.data);
    if (info) set(info);
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      if (state !== EMPTY) set(EMPTY);
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
