/**
 * What a room usually holds: the P5 fixture rule as a pure function.
 *
 * Every visit to a room lists what was seen in it. A thing seen once is `transient`. It becomes a `fixture` when it has
 * been seen on at least `minVisits` visits, over at least `minDays` distinct play days, and was present on at least
 * `minRatio` of the visits since it was first seen. A fixture that is missing for `demoteAfterMisses` visits in a row
 * is demoted: it leaves `contents` and its record is kept in `was`, so a wrong demotion is reversible and nothing is
 * forgotten. A transient that is missing that long simply expires. People (`kind: 'player'`) never enter a baseline.
 *
 * The four numbers are config (`BaselineConfig`); nothing in here reads a clock, a file or a random source. A visit
 * with a malformed day is ignored whole: the memory fails safe and keeps what it had.
 */

import {
  cloneJson,
  DATE_PATTERN,
  emptyBaseline,
  LIMITS,
  type ContentKind,
  type ContentRecord,
  type RoomBaseline,
  type WasRecord,
} from './schema.js';

export interface BaselineConfig {
  /** Visits a thing must have been seen on before it can be a fixture. */
  minVisits: number;
  /** Distinct play days those sightings must span. */
  minDays: number;
  /** Seen visits divided by visits since it was first seen, 0 to 1. */
  minRatio: number;
  /** Consecutive visits without it before a fixture is demoted (or a transient expires). */
  demoteAfterMisses: number;
}

export const DEFAULT_BASELINE_CONFIG: Readonly<BaselineConfig> = Object.freeze({
  minVisits: 5,
  minDays: 3,
  minRatio: 0.8,
  demoteAfterMisses: 3,
});

const MAX_COUNT = 1_000;

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : fallback;
}

/** Config from anything: a value that is not usable falls back to its default instead of failing. */
export function normalizeBaselineConfig(input?: { [K in keyof BaselineConfig]?: unknown } | null): BaselineConfig {
  const d = DEFAULT_BASELINE_CONFIG;
  const ratio = input?.minRatio;
  return {
    minVisits: positiveInt(input?.minVisits, d.minVisits),
    minDays: positiveInt(input?.minDays, d.minDays),
    minRatio: typeof ratio === 'number' && ratio > 0 && ratio <= 1 ? ratio : d.minRatio,
    demoteAfterMisses: positiveInt(input?.demoteAfterMisses, d.demoteAfterMisses),
  };
}

export interface VisitEntry {
  label: string;
  kind: ContentKind;
  /** How many of it the visit showed; 1 when absent. */
  count?: number;
}

export interface Visit {
  /** The play day, `YYYY-MM-DD`. A session is a play day plus a character; the caller counts each session's visit. */
  day: string;
  entries: VisitEntry[];
}

/** The key two printings of the same thing share: case and spacing do not matter. */
export function contentKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function clean(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, LIMITS.shortText);
}

function addDay(days: readonly string[], day: string): string[] {
  if (days.includes(day)) return [...days];
  const next = [...days, day].sort();
  return next.length > LIMITS.maxDays ? next.slice(next.length - LIMITS.maxDays) : next;
}

function meetsRule(record: ContentRecord, config: BaselineConfig): boolean {
  return (
    record.seen >= config.minVisits &&
    record.days.length >= config.minDays &&
    record.seen / record.observed >= config.minRatio
  );
}

function toWas(record: ContentRecord, demotedOn: string): WasRecord {
  return {
    label: record.label,
    kind: record.kind,
    seen: record.seen,
    observed: record.observed,
    count: record.count,
    firstSeen: record.firstSeen,
    lastSeen: record.lastSeen,
    demotedOn,
    returns: record.returns,
  };
}

/** What one visit showed, merged by key (case and spacing ignored), people and empty labels left out. */
function collect(entries: readonly VisitEntry[]): Map<string, { label: string; kind: ContentKind; count: number }> {
  const seen = new Map<string, { label: string; kind: ContentKind; count: number }>();
  for (const entry of entries) {
    if (entry.kind === 'player' || typeof entry.label !== 'string') continue;
    const label = clean(entry.label);
    if (label === '') continue;
    const count =
      typeof entry.count === 'number' && Number.isInteger(entry.count) && entry.count >= 1
        ? Math.min(entry.count, MAX_COUNT)
        : 1;
    const key = contentKey(label);
    const prior = seen.get(key);
    if (prior) prior.count = Math.min(prior.count + count, MAX_COUNT);
    else seen.set(key, { label, kind: entry.kind, count });
  }
  return seen;
}

/** Keeps `contents` within the cap: transients with the least evidence go first, fixtures only if nothing else is left. */
function capContents(contents: ContentRecord[]): ContentRecord[] {
  if (contents.length <= LIMITS.maxContents) return contents;
  const rank = (r: ContentRecord): number => (r.status === 'fixture' ? 1 : 0);
  const keep = [...contents].sort(
    (a, b) => rank(b) - rank(a) || b.seen - a.seen || b.lastSeen.localeCompare(a.lastSeen),
  );
  const kept = new Set(keep.slice(0, LIMITS.maxContents));
  return contents.filter((r) => kept.has(r));
}

/**
 * The baseline after one more visit. `prev` is never changed; with a malformed visit the result is a copy of `prev`.
 */
export function updateBaseline(
  prev: RoomBaseline | undefined,
  visit: Visit,
  config: BaselineConfig = DEFAULT_BASELINE_CONFIG,
): RoomBaseline {
  const base: RoomBaseline = prev ? cloneJson(prev) : emptyBaseline();
  if (
    typeof visit?.day !== 'string' ||
    !DATE_PATTERN.test(visit.day) ||
    visit.day.length !== 10 ||
    !Array.isArray(visit.entries)
  )
    return base;
  const day = visit.day;
  const present = collect(visit.entries);

  base.visits += 1;
  base.days = addDay(base.days, day);

  const next: ContentRecord[] = [];
  const handled = new Set<string>();
  const was = base.was;
  const demoted: WasRecord[] = [];
  const restored = new Set<string>();

  for (const record of base.contents) {
    const key = contentKey(record.label);
    handled.add(key);
    const now = present.get(key);
    record.observed += 1;
    if (now) {
      record.seen += 1;
      record.count = now.count;
      record.missed = 0;
      record.days = addDay(record.days, day);
      if (day > record.lastSeen) record.lastSeen = day;
      if (day < record.firstSeen) record.firstSeen = day;
    } else {
      record.missed += 1;
    }

    if (record.status === 'transient' && meetsRule(record, config)) {
      record.status = 'fixture';
      const earlier = was.find((w) => contentKey(w.label) === key);
      if (earlier) {
        record.returns = earlier.returns + 1;
        restored.add(key);
      }
    }
    if (record.missed >= config.demoteAfterMisses) {
      if (record.status === 'fixture') demoted.push(toWas(record, day));
      continue; // a fixture moves to `was`; a transient that long absent expires
    }
    next.push(record);
  }

  for (const [key, now] of present) {
    if (handled.has(key)) continue;
    const earlier = was.find((w) => contentKey(w.label) === key);
    const fresh: ContentRecord = {
      label: now.label,
      kind: now.kind,
      status: 'transient',
      seen: 1,
      observed: 1,
      count: now.count,
      days: [day],
      firstSeen: day,
      lastSeen: day,
      missed: 0,
      returns: earlier ? earlier.returns : 0,
    };
    // With a config that needs one sighting on one day, the very first sighting already passes.
    if (meetsRule(fresh, config)) {
      fresh.status = 'fixture';
      if (earlier) {
        fresh.returns = earlier.returns + 1;
        restored.add(key);
      }
    }
    next.push(fresh);
  }

  const keptWas = was.filter(
    (w) => !restored.has(contentKey(w.label)) && !demoted.some((d) => contentKey(d.label) === contentKey(w.label)),
  );
  const nextWas = [...keptWas, ...demoted].sort((a, b) => a.demotedOn.localeCompare(b.demotedOn));
  base.was = nextWas.length > LIMITS.maxWas ? nextWas.slice(nextWas.length - LIMITS.maxWas) : nextWas;
  base.contents = capContents(next);
  return base;
}

function unionDays(a: readonly string[], b: readonly string[]): string[] {
  const all = [...new Set([...a, ...b])].sort();
  return all.length > LIMITS.maxDays ? all.slice(all.length - LIMITS.maxDays) : all;
}

/**
 * The baseline of two rooms that turned out to be one: visits and sightings add up, the dates widen, a thing that was a
 * fixture in either stays one. Nothing is re-evaluated (no config in a merge), so a thing that only passes the rule
 * because of the sum is promoted by the next visit's `updateBaseline`.
 */
export function mergeBaselines(a: RoomBaseline | undefined, b: RoomBaseline | undefined): RoomBaseline {
  const left = a ? cloneJson(a) : emptyBaseline();
  const right = b ? cloneJson(b) : emptyBaseline();
  const byKey = new Map<string, ContentRecord>();
  for (const record of left.contents) byKey.set(contentKey(record.label), record);
  for (const record of right.contents) {
    const key = contentKey(record.label);
    const held = byKey.get(key);
    if (!held) {
      byKey.set(key, record);
      continue;
    }
    held.seen += record.seen;
    held.observed += record.observed;
    held.count = Math.max(held.count, record.count);
    held.days = unionDays(held.days, record.days);
    if (record.firstSeen < held.firstSeen) held.firstSeen = record.firstSeen;
    if (record.lastSeen > held.lastSeen) held.lastSeen = record.lastSeen;
    held.missed = Math.min(held.missed, record.missed);
    held.returns = Math.max(held.returns, record.returns);
    if (record.status === 'fixture') held.status = 'fixture';
  }
  const was = new Map<string, WasRecord>();
  for (const record of [...left.was, ...right.was]) {
    const key = contentKey(record.label);
    const held = was.get(key);
    if (!held || record.demotedOn > held.demotedOn) was.set(key, record);
  }
  for (const [key, record] of byKey) if (record.status === 'fixture') was.delete(key);
  const keptWas = [...was.values()].sort((x, y) => x.demotedOn.localeCompare(y.demotedOn));
  return {
    visits: left.visits + right.visits,
    days: unionDays(left.days, right.days),
    contents: capContents([...byKey.values()]),
    was: keptWas.length > LIMITS.maxWas ? keptWas.slice(keptWas.length - LIMITS.maxWas) : keptWas,
  };
}

/** The fixtures of a baseline (what the room can be expected to hold), in the order they were first seen. */
export function fixturesOf(baseline: RoomBaseline | undefined): ContentRecord[] {
  return baseline ? baseline.contents.filter((c) => c.status === 'fixture') : [];
}
