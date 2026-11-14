import { emptyMap, validateMapFile, type MapFile } from '@shatteredarchive/shattered-maps-core';
import { emptyLog, type Decision, type ReviewLog } from './review';

/**
 * What the curator has done survives a reload: the audited map file and the review log are kept in the browser (the candidates file
 * is not: it can be large, and it is opened again from its file). The keys are new; the classic editor's `dslmapper.autosave` is its
 * own and is not touched.
 */

export const AUDITED_KEY = 'shatteredmaps.audited';
export const REVIEW_KEY = 'shatteredmaps.review';

const STATUSES = ['accepted', 'rejected', 'edited'];

/** The log as stored, or an empty one if it is missing or not shaped like a log. Decisions that are malformed are dropped. */
export function parseLog(raw: unknown): ReviewLog {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return emptyLog();
  const list = (raw as { decisions?: unknown }).decisions;
  if (!Array.isArray(list)) return emptyLog();
  const decisions: Decision[] = [];
  for (const d of list) {
    if (typeof d !== 'object' || d === null) continue;
    const o = d as Record<string, unknown>;
    if ((o.kind !== 'room' && o.kind !== 'link') || typeof o.id !== 'string' || typeof o.at !== 'string' || typeof o.note !== 'string') continue;
    if (typeof o.status !== 'string' || !STATUSES.includes(o.status)) continue;
    const out: Decision = { kind: o.kind, id: o.id, status: o.status as Decision['status'], at: o.at, note: o.note };
    if (Array.isArray(o.edits) && o.edits.every((e) => typeof e === 'string')) out.edits = o.edits as string[];
    decisions.push(out);
  }
  return { version: 1, decisions };
}

export function loadAudited(storage: Pick<Storage, 'getItem'> = localStorage): { audited: MapFile; log: ReviewLog } {
  let audited = emptyMap();
  let log = emptyLog();
  try {
    const raw = storage.getItem(AUDITED_KEY);
    if (raw) {
      const verdict = validateMapFile(JSON.parse(raw));
      if (verdict.ok) audited = verdict.map;
    }
    const rawLog = storage.getItem(REVIEW_KEY);
    if (rawLog) log = parseLog(JSON.parse(rawLog));
  } catch {
    // unreadable storage or text that is not JSON: start empty rather than refuse to open
  }
  return { audited, log };
}

/** Returns `false` when the browser refused the write (storage full, or unavailable); the work is then only in memory. */
export function saveAudited(audited: MapFile, log: ReviewLog, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(AUDITED_KEY, JSON.stringify(audited));
    storage.setItem(REVIEW_KEY, JSON.stringify(log));
    return true;
  } catch {
    return false;
  }
}
