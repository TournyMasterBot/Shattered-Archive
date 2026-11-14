import type { Confidence } from '../contracts.js';

/** A bucket needs at least this many owner decisions before its history counts (decision P4). Not a setting. */
export const MIN_BUCKET_SAMPLES = 20;

/** The owner's past decisions for one (sphere, action kind) bucket. */
export interface BucketStats {
  /** Decisions where the owner accepted the suggestion as it was. */
  approved: number;
  /** All counted decisions: approved, corrected and rejected. */
  total: number;
}

/** z for a 95% interval. */
const Z = 1.96;

/** A usable confidence: a finite number in [0, 1]. Anything else is null (and the policy asks). */
export function toConfidence(value: unknown): Confidence {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function validStats(stats: unknown): stats is BucketStats {
  if (typeof stats !== 'object' || stats === null) return false;
  const { approved, total } = stats as Record<string, unknown>;
  return (
    typeof approved === 'number' &&
    typeof total === 'number' &&
    Number.isInteger(approved) &&
    Number.isInteger(total) &&
    approved >= 0 &&
    total >= 0 &&
    approved <= total
  );
}

/**
 * Lower bound of the Wilson score interval (95%) for the share of approved decisions. A single approval is worth little and
 * twenty approvals out of twenty is about 0.84, so confidence is earned slowly. Returns null for impossible counts and 0 for no data.
 */
export function wilsonLower(approved: number, total: number): number | null {
  return validStats({ approved, total }) ? wilson(approved, total) : null;
}

/** The interval bound for counts already known to be valid. */
function wilson(approved: number, total: number): number {
  if (total === 0) return 0;
  const p = approved / total;
  const z2 = Z * Z;
  const centre = p + z2 / (2 * total);
  const margin = Z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return Math.max(0, (centre - margin) / (1 + z2 / total));
}

export interface EffectiveConfidence {
  /** min(rating, Wilson lower bound), or null when it cannot be computed. */
  value: number | null;
  /** The bucket has enough decisions (at least MIN_BUCKET_SAMPLES) for the history to count. */
  eligible: boolean;
  samples: number;
}

/**
 * Effective confidence = min(rating, Wilson lower bound of the owner's approval rate for the bucket) (P4).
 * The rating is the model's own, or the evidence of a confirmed map edge when `edgeEvidence` is given (map movement uses the
 * edge's evidence instead of a model rating). A rating that is not a finite number in [0, 1], missing or broken bucket
 * statistics, or fewer than MIN_BUCKET_SAMPLES decisions all give `value: null`, and the policy then asks.
 */
export function effectiveConfidence(model: unknown, bucket: unknown, edgeEvidence?: unknown): EffectiveConfidence {
  const samples = validStats(bucket) ? bucket.total : 0;
  const rating = toConfidence(edgeEvidence !== undefined ? edgeEvidence : model);
  if (rating === null || !validStats(bucket) || bucket.total < MIN_BUCKET_SAMPLES) {
    return { value: null, eligible: validStats(bucket) && bucket.total >= MIN_BUCKET_SAMPLES, samples };
  }
  return { value: Math.min(rating, wilson(bucket.approved, bucket.total)), eligible: true, samples };
}
