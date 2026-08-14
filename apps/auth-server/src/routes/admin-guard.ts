import type { RequestHandler } from 'express';

import type { AccountStore, AccountRecord } from '../account-store.js';
import { GLOBAL_TIERS, type GlobalTier } from '../global-tiers.js';
import type { SessionContext } from './session-guard.js';

/**
 * AI-ANNOTATION
 * @ai-summary A2 admin-surface guard + the server-side strictly-below rules:
 *   requireElevated (after sessionGuard) 403s plain 'user' accounts on EVERY
 *   admin route including list; canManageTier/assignableTiers implement
 *   "manage only strictly below yourself" — peers refuse, owner is never
 *   assignable over HTTP (host scripts only). Implemented against auth-server's
 *   own authoritative GLOBAL_TIERS, never services-server's mirror.
 * @ai-public requireElevated, canManageTier, assignableTiers, globalTierOf, AdminContext
 */

export interface AdminContext {
  actor: AccountRecord;
  actorTier: GlobalTier;
}

export function globalTierOf(account: AccountRecord): GlobalTier {
  return account.globalRole ?? 'user';
}

function rank(tier: GlobalTier): number {
  return GLOBAL_TIERS.indexOf(tier);
}

/** Strictly-below: the actor outranks the target's CURRENT tier. Peers (and self) refuse. */
export function canManageTier(actor: GlobalTier, target: GlobalTier): boolean {
  return rank(actor) < rank(target);
}

/** Tiers this actor may ASSIGN — strictly below their own, so 'owner' is never in anyone's list. */
export function assignableTiers(actor: GlobalTier): GlobalTier[] {
  return GLOBAL_TIERS.filter((tier) => rank(actor) < rank(tier));
}

/** Must run AFTER sessionGuard — loads the actor and refuses the plain 'user' tier. */
export function requireElevated(accountStore: AccountStore): RequestHandler {
  return (req, res, next) => {
    const session = res.locals.session as SessionContext | undefined;
    const actor = session ? accountStore.findById(session.accountId) : undefined;
    if (!actor) {
      res.status(401).json({ error: 'a valid session is required' });
      return;
    }
    const actorTier = globalTierOf(actor);
    if (actorTier === 'user') {
      res.status(403).json({ error: 'insufficient privileges' });
      return;
    }
    res.locals.admin = { actor, actorTier } satisfies AdminContext;
    next();
  };
}
