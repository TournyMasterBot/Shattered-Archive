import { SERVICE_TIERS, tierRank } from '@shatteredarchive/services-server';

import type { RoleStore } from './role-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Tier/eligibility gate for the engine-management routes, mirroring
 *   mud-builder-server's routes/auth.ts checkRebuildEligibility() exactly (same builder-tier
 *   floor, same short-lived-token requirement for the highest-risk action), adapted for
 *   simulacrum-server's single-actor-kind model — there is no master-key/local-key concept
 *   here (Constraints: introspect-only), so every caller is uniformly an introspected
 *   account and there is no kind-branch to special-case.
 * @ai-public checkEngineActionEligibility
 */

interface AccountWithExpiry {
  accountId: string;
  expiresAt?: string | null;
}

export type EngineActionEligibility = { allowed: true } | { allowed: false; reason: string };

// Mirrors mud-builder-server's REBUILD_MAX_TOKEN_TTL_MS exactly — a "forever" or long-lived
// pasted key must not unlock the rebuild trigger even at builder tier.
const REBUILD_MAX_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function checkEngineActionEligibility(
  account: AccountWithExpiry,
  roleStore: RoleStore,
  requireShortLivedToken: boolean,
): EngineActionEligibility {
  const tier = roleStore.tierFor(account.accountId);
  if (tierRank(SERVICE_TIERS, tier) > tierRank(SERVICE_TIERS, 'builder')) {
    return { allowed: false, reason: 'this action requires builder tier or above (see the Roles tab)' };
  }
  if (!requireShortLivedToken) return { allowed: true };
  if (!account.expiresAt) {
    return {
      allowed: false,
      reason: 'this action requires a short-lived token (expiring within 7 days) — a forever key is not accepted',
    };
  }
  const expiresAtMs = Date.parse(account.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs > Date.now() + REBUILD_MAX_TOKEN_TTL_MS) {
    return { allowed: false, reason: 'this action requires a token expiring within 7 days' };
  }
  return { allowed: true };
}
