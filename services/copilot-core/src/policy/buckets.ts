import { isActionKind, isSphere, type ActionKind, type Decision, type Sphere } from '../contracts.js';
import type { BucketStats } from './confidence.js';
import { ruleKey } from './settings.js';

/** The owner's history per bucket, keyed `<sphere>:<kind>` (the same key a rule uses). */
export type BucketTable = Record<string, BucketStats>;

/**
 * Counts the owner's own answers per (sphere, action kind) bucket. `approved` is an answer accepted as it was; `total` adds the
 * corrections and rejections. The agent's own runs (`auto`) and the gate's refusals (`refused`) are NOT the owner's judgement, so they
 * never count, and neither does a line without a bucket (older lines) or with one that is not a known sphere and kind. A later line
 * with the same id never counts twice.
 */
export function countBuckets(decisions: Iterable<Decision>): BucketTable {
  const table: BucketTable = {};
  const seen = new Set<string>();
  for (const d of decisions) {
    if (d.outcome !== 'approved' && d.outcome !== 'corrected' && d.outcome !== 'rejected') continue;
    if (!isSphere(d.sphere) || !isActionKind(d.kind)) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const key = ruleKey(d.sphere, d.kind);
    const entry = Object.hasOwn(table, key) ? table[key] : (table[key] = { approved: 0, total: 0 });
    entry.total += 1;
    if (d.outcome === 'approved') entry.approved += 1;
  }
  return table;
}

/** What a server sent as a table, kept only where every entry is a real bucket with possible counts (the rest is dropped). */
export function readBucketTable(input: unknown): BucketTable {
  const table: BucketTable = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return table;
  for (const [key, value] of Object.entries(input)) {
    const [sphere, kind] = key.split(':');
    if (!isSphere(sphere) || !isActionKind(kind) || key !== ruleKey(sphere, kind)) continue;
    if (typeof value !== 'object' || value === null) continue;
    const { approved, total } = value as Record<string, unknown>;
    if (typeof approved !== 'number' || typeof total !== 'number') continue;
    if (!Number.isInteger(approved) || !Number.isInteger(total) || approved < 0 || approved > total) continue;
    table[key] = { approved, total };
  }
  return table;
}

/** The bucket's counts, or undefined when the owner has never answered in it. */
export function bucketStats(table: BucketTable, sphere: Sphere, kind: ActionKind): BucketStats | undefined {
  const key = ruleKey(sphere, kind);
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
