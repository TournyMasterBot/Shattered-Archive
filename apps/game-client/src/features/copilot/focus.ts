import type { KeyValueStorage } from './settings';

type FocusStorage = Pick<KeyValueStorage, 'getItem' | 'setItem'>;

/**
 * What Copilot is for right now.
 * - `training`: every suggestion waits for the owner (approve, correct or reject). The answers are what Copilot learns from; nothing runs by itself.
 * - `agent`: Copilot drives. A suggestion runs by itself only when the trust settings allow it (a rule enabled for its sphere and kind,
 *   enough of the owner's earlier approvals in that bucket, confidence over the threshold). Spending, speaking, anything irreversible,
 *   player-kill and every command Copilot cannot classify (group, follow, order, emotes at players) still wait for the owner.
 */
export type Focus = 'training' | 'agent';

export const FOCUS_KEY = 'copilot.focus.v1';
export const DEFAULT_FOCUS: Focus = 'training';
export const FOCUS_LABELS: Record<Focus, string> = { training: 'Training', agent: 'AI agent' };

export interface FocusStore {
  get(): Focus;
  set(focus: Focus): void;
  subscribe(listener: (focus: Focus) => void): () => void;
  /** Wire this to the window's `storage` event: another tab changed the focus. */
  onStorageEvent(event: { key: string | null; newValue: string | null }): void;
}

/**
 * The focus, kept per browser under `copilot.focus.v1`. It is Training until the owner picks the AI agent, and only the exact stored
 * text `agent` counts as the agent: a missing, damaged or blocked value is Training, the safe reading. The window, the review list's
 * auto-approval and the other tabs read the same store.
 */
export function createFocusStore(storage: FocusStorage | undefined): FocusStore {
  let current = read(storage);
  const listeners = new Set<(focus: Focus) => void>();

  function change(next: Focus): void {
    if (next === current) return;
    current = next;
    for (const listener of [...listeners]) listener(current);
  }

  return {
    get: () => current,
    set(focus) {
      try {
        storage?.setItem(FOCUS_KEY, focus);
      } catch {
        // a blocked or full storage: the choice lasts until the page closes
      }
      change(focus);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onStorageEvent(event) {
      // `key` is null when the whole storage was cleared: that is back to the default, Training
      if (event.key === null) change(DEFAULT_FOCUS);
      else if (event.key === FOCUS_KEY) change(event.newValue === 'agent' ? 'agent' : 'training');
    },
  };
}

function read(storage: FocusStorage | undefined): Focus {
  try {
    return storage?.getItem(FOCUS_KEY) === 'agent' ? 'agent' : DEFAULT_FOCUS;
  } catch {
    return DEFAULT_FOCUS;
  }
}
