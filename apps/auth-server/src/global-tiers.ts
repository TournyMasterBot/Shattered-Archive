/**
 * AI-ANNOTATION
 * @ai-summary Hub-global account tiers, highest authority first. DISTINCT from
 *   the per-service delegated ladder (owner > admin > manager > trusted > user)
 *   that consumer services keep in their own stores — the hub never stores
 *   service-local tiers. services-server mirrors this list for consumers:
 *   deliberate duplication across the app boundary, same rationale as the
 *   compact assertion format.
 * @ai-public GLOBAL_TIERS, GlobalTier, isGlobalTier
 */

export const GLOBAL_TIERS = ['owner', 'admin', 'moderator', 'user'] as const;

export type GlobalTier = (typeof GLOBAL_TIERS)[number];

export function isGlobalTier(value: string): value is GlobalTier {
  return (GLOBAL_TIERS as readonly string[]).includes(value);
}
