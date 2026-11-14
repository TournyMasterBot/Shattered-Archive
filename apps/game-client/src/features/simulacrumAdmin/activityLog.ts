import type { Verdict } from './verdict';

export const ACTIVITY_CAP = 200;

export interface ActivityEntry {
  id: number;
  /** ISO time the command was sent. */
  at: string;
  /** The exact line sent. */
  line: string;
  verdict: Verdict;
  /** The reply line that decided the verdict. */
  reason?: string;
  /** The reply as text to read. */
  replyLines: string[];
  /** The reply exactly as received, for "copy raw". */
  rawReply: string;
}

export type NewActivityEntry = Omit<ActivityEntry, 'id'>;

export interface ActivityLog {
  /** Newest last; the same array until something changes. */
  getEntries(): readonly ActivityEntry[];
  subscribe(listener: () => void): () => void;
  add(entry: NewActivityEntry): ActivityEntry;
  clear(): void;
}

/**
 * What was sent and what the game answered. Memory only (S8, LIVESTRM-01): nothing is written to storage, the oldest entries are dropped
 * past the cap, and the loader clears it when the connection leaves the simulacrum.
 */
export function createActivityLog(cap: number = ACTIVITY_CAP): ActivityLog {
  let entries: readonly ActivityEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    getEntries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(entry) {
      const stored: ActivityEntry = { ...entry, id: nextId++ };
      entries = entries.length >= cap ? [...entries.slice(entries.length - cap + 1), stored] : [...entries, stored];
      notify();
      return stored;
    },
    clear() {
      if (entries.length === 0) return;
      entries = [];
      notify();
    },
  };
}
