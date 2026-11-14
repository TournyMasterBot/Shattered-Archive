import type { CharacterRecord, CharacterStore, JsonlStore } from '@shatteredarchive/copilot-core';
import type { NameEntry } from './records.js';

/** copilot-core's CharacterStore plus a listing of the names, which the privacy scrubber needs. */
export interface NameDirectory extends CharacterStore {
  /** Every registered real name (normalised) with its record. Real names: for scrubbing only, never for output. */
  names(): { key: string; record: CharacterRecord }[];
}

function toRecord(entry: NameEntry): CharacterRecord {
  return { codename: entry.codename, kind: 'real', gender: entry.gender, firstSeen: entry.firstSeen, lastSeen: entry.lastSeen };
}

/**
 * The real-name registry on a JsonlStore: one whole line per change, so a failed write changes nothing (the CharacterStore
 * contract). The normalised name is the entry's id; that file is the only place a real name is kept.
 */
export function namesStoreOver(store: JsonlStore<NameEntry>): NameDirectory {
  return {
    async get(nameKey) {
      const entry = store.get(nameKey);
      return entry === undefined ? undefined : toRecord(entry);
    },
    async put(nameKey, record) {
      const saved = await store.append({ id: nameKey, ...record });
      if (!saved.ok) throw new Error('could not save the character registry');
    },
    async codenames() {
      return store.query().map((entry) => entry.codename);
    },
    names() {
      return store.query().map((entry) => ({ key: entry.id, record: toRecord(entry) }));
    },
  };
}
