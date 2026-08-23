/**
 * Consumer-side mirror of the auth-server tier model (Phase A). The hub's
 * authoritative ladder lives in apps/auth-server/src/global-tiers.ts —
 * deliberately duplicated here rather than imported across the app boundary,
 * same rationale as the compact assertion format in auth-introspect-client.
 *
 * TWO DISTINCT ladders, both ordered highest-authority first:
 *  - GLOBAL_TIERS: the hub-global role carried on introspect/exchange
 *    responses (`globalRole`).
 *  - SERVICE_TIERS: the delegated per-service ladder each consumer keeps in
 *    its OWN role store keyed by authAccountId.
 */

export const GLOBAL_TIERS = ['owner', 'admin', 'moderator', 'user'] as const;
export type GlobalTier = (typeof GLOBAL_TIERS)[number];

export const SERVICE_TIERS = ['owner', 'admin', 'manager', 'builder', 'trusted', 'user'] as const;
export type ServiceTier = (typeof SERVICE_TIERS)[number];

/** Index in the ladder (0 = highest authority); -1 for a tier the ladder doesn't know. */
export function tierRank(ladder: readonly string[], tier: string): number {
  return ladder.indexOf(tier);
}

/**
 * The strictly-below rule: an actor manages only accounts of LESSER authority
 * than their own — peers refuse (an admin cannot touch a peer admin), and an
 * unknown tier on either side fails CLOSED (a newer hub tier this consumer
 * doesn't know yet must not become manageable-by-accident).
 */
export function canManage(ladder: readonly string[], actorTier: string, targetTier: string): boolean {
  const actor = tierRank(ladder, actorTier);
  const target = tierRank(ladder, targetTier);
  if (actor === -1 || target === -1) return false;
  return actor < target;
}
