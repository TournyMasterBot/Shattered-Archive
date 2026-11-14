/**
 * What Copilot has learned about the monsters in front of it, so it never starts a fight blind.
 *
 * Two sources, in the order the rule asks for them: a lookup in the archive through the MCP (is this monster known: its level, its dangers),
 * and, for a monster the archive cannot name, `consider` in the game itself (`consider.ts`: the level band). An entry is kept per ROOM and per
 * keyword, because a keyword like "guard" means a different creature in the next room, and it expires (a monster that was considered a quarter
 * of an hour ago may have been replaced by another with the same name). The store is bounded.
 *
 * Players type one word to name a target (`kill orc`: the game's `one_argument` takes the first word, with an optional `2.` count in front),
 * and the game matches it as a prefix of a name of the creature, so `or` and `orc` can name the same one: two keywords are the same target when
 * one is a prefix of the other.
 *
 * Pure: the clock is passed in.
 */

import type { ConsiderResult } from './consider.js';

export interface LookupOutcome {
  /** The archive knows a monster by this name. */
  found: boolean;
  /** Short facts the archive gave (already trimmed by the caller), for the prompt. */
  facts: string[];
}

export interface TargetKnowledge {
  lookup?: LookupOutcome & { at: number };
  considered?: { result: ConsiderResult; at: number };
}

export const DEFAULT_TTL_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_ENTRIES = 200;

/** The first word of a target as the game reads it: lower case, the `2.` count removed. Empty when there is no usable word. */
export function keywordOf(text: string): string {
  const first = text.trim().split(/\s+/)[0];
  return first.toLowerCase().replace(/^\d+\./, '');
}

/** Two keywords name the same target when one is a prefix of the other (the game's `is_name` matches prefixes). */
export function sameTarget(a: string, b: string): boolean {
  return a !== '' && b !== '' && (a.startsWith(b) || b.startsWith(a));
}

interface Entry extends TargetKnowledge {
  room: string;
  keyword: string;
  touched: number;
}

export class MonsterKnowledge {
  private entries: Entry[] = [];
  private readonly ttlMs: number;
  private readonly max: number;

  constructor(options: { ttlMs?: number; max?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.max = options.max ?? DEFAULT_MAX_ENTRIES;
  }

  private entry(room: string, keyword: string, now: number): Entry {
    this.entries = this.entries.filter((e) => now - e.touched <= this.ttlMs);
    let found = this.entries.find((e) => e.room === room && sameTarget(e.keyword, keyword));
    if (found === undefined) {
      found = { room, keyword, touched: now };
      this.entries.push(found);
      if (this.entries.length > this.max) this.entries.shift();
    }
    found.touched = now;
    return found;
  }

  recordLookup(room: string, keyword: string, outcome: LookupOutcome, now: number): void {
    if (keyword === '') return;
    this.entry(room, keyword, now).lookup = { ...outcome, at: now };
  }

  recordConsider(room: string, keyword: string, result: ConsiderResult, now: number): void {
    if (keyword === '') return;
    this.entry(room, keyword, now).considered = { result, at: now };
  }

  /** What is known about a target in a room, or undefined when nothing (or only something that has expired). */
  get(room: string, keyword: string, now: number): TargetKnowledge | undefined {
    const e = this.entries.find((x) => x.room === room && sameTarget(x.keyword, keyword) && now - x.touched <= this.ttlMs);
    if (e === undefined) return undefined;
    const out: TargetKnowledge = {};
    if (e.lookup !== undefined) out.lookup = e.lookup;
    if (e.considered !== undefined) out.considered = e.considered;
    return out;
  }

  size(): number {
    return this.entries.length;
  }
}
