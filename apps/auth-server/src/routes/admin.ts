import express, { type Application, type Request } from 'express';

import type { AccountRecord } from '../account-store.js';
import { generateOneTimePassword } from '../account-store.js';
import type { AuthServerDeps } from '../deps.js';
import { AuthError } from '../errors.js';
import { safe } from './safe.js';
import { sessionGuard, mustChangePasswordGuard } from './session-guard.js';
import { requireElevated, canManageTier, assignableTiers, globalTierOf, type AdminContext } from './admin-guard.js';
import { requireString } from './validation.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * AI-ANNOTATION
 * @ai-summary A2 admin surface (session + mustChangePassword + requireElevated
 *   guarded — a plain 'user' 403s on everything, list included): paged/searchable
 *   user list with live per-account credential counts (never hashes or token
 *   material), strictly-below role assignment (target's CURRENT tier and the NEW
 *   tier must both sit below the actor; owner never assignable over HTTP),
 *   guarded temp-password recovery (one-time password shown once, forces change,
 *   bumps epoch), and the delegation-surface service listing. Role changes and
 *   temp-passwords append to the audit log.
 * @ai-public registerAdminRoutes
 * @ai-notes Unknown target id is a 404; a KNOWN but unmanageable target is a 403
 *   — existence isn't a secret here (the list already shows every account to any
 *   elevated actor), unlike the keys routes' ownership 404s.
 */
export function registerAdminRoutes(app: Application, deps: AuthServerDeps): void {
  app.use('/api/admin', express.json({ limit: '16kb' }));
  app.use(
    '/api/admin',
    sessionGuard(deps.accountStore, deps.keyStore),
    mustChangePasswordGuard(deps.accountStore),
    requireElevated(deps.accountStore),
  );

  const requireTarget = (req: Request): AccountRecord => {
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw new AuthError('account id is required', 400);
    const target = deps.accountStore.findById(id);
    if (!target) throw new AuthError(`no account with id ${JSON.stringify(id)}`, 404);
    return target;
  };

  const requireManageable = (admin: AdminContext, target: AccountRecord): void => {
    if (!canManageTier(admin.actorTier, globalTierOf(target))) {
      throw new AuthError('you can only manage accounts of lesser privilege than your own', 403);
    }
  };

  app.get(
    '/api/admin/users',
    safe((req, res) => {
      const admin = res.locals.admin as AdminContext;
      const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
      const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));

      const matches = deps.accountStore
        .listAll()
        .filter((a) => !query || a.usernameNormalized.includes(query))
        .sort((a, b) => a.usernameNormalized.localeCompare(b.usernameNormalized));

      const users = matches.slice(offset, offset + limit).map((a) => ({
        id: a.id,
        username: a.username,
        globalRole: globalTierOf(a),
        createdAt: a.createdAt,
        mustChangePassword: a.mustChangePassword,
        emailOnFile: Boolean(a.email),
        emailVerified: Boolean(a.emailVerifiedAt),
        counts: deps.keyStore.countForAccount(a.id),
        manageable: canManageTier(admin.actorTier, globalTierOf(a)),
      }));

      res.json({ users, total: matches.length, assignableTiers: assignableTiers(admin.actorTier) });
    }),
  );

  app.post(
    '/api/admin/users/:id/role',
    safe((req, res) => {
      const admin = res.locals.admin as AdminContext;
      const target = requireTarget(req);
      requireManageable(admin, target);

      const role = requireString(req.body, 'role');
      // setGlobalRole 400s an unknown tier; this check enforces the assignment ceiling.
      if (role !== 'user' && !(assignableTiers(admin.actorTier) as string[]).includes(role)) {
        throw new AuthError('you can only assign tiers strictly below your own', 403);
      }

      deps.accountStore.setGlobalRole(target.id, role);
      deps.auditLog.append({
        actorId: admin.actor.id,
        actorUsername: admin.actor.username,
        action: 'set-global-role',
        targetId: target.id,
        targetUsername: target.username,
        detail: role,
      });
      res.json({ id: target.id, username: target.username, globalRole: deps.accountStore.require(target.id).globalRole ?? 'user' });
    }),
  );

  app.post(
    '/api/admin/users/:id/temp-password',
    safe(async (req, res) => {
      const admin = res.locals.admin as AdminContext;
      const target = requireTarget(req);
      requireManageable(admin, target);

      const temporaryPassword = generateOneTimePassword();
      await deps.accountStore.adminSetTemporaryPassword(target.id, temporaryPassword);
      deps.auditLog.append({
        actorId: admin.actor.id,
        actorUsername: admin.actor.username,
        action: 'temp-password',
        targetId: target.id,
        targetUsername: target.username,
      });
      res.json({
        id: target.id,
        username: target.username,
        temporaryPassword,
        note: 'shown exactly once — the account must change it at next login, and every prior session/key is now invalid',
      });
    }),
  );

  app.get(
    '/api/admin/services',
    safe((_req, res) => {
      res.json({ services: deps.serviceKeyStore.listServices() });
    }),
  );
}
