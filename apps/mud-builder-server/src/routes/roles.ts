import express, { type Application, type Request, type Response } from 'express';
import { SERVICE_TIERS, canManage, type ServiceTier } from '@shatteredarchive/services-server';

import type { AuthStore, BuilderActor } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import { RoleStore, isServiceTier } from '../role-store.js';
import { requireAnyActor } from './auth.js';

/**
 * AI-ANNOTATION
 * @ai-summary Phase G: mud-builder's delegated role-management surface
 *   (Decision 4) — GET /api/roles/me (any actor, own standing only), GET
 *   /api/roles (grant list, gated), POST /api/roles/:accountId (set a
 *   grant, gated). 'owner' is never assignable over HTTP by anyone
 *   (mirrors auth-server admin-guard.ts's identical rule for its GLOBAL
 *   ladder) — the ceiling for master AND a hub-global owner/admin AND an
 *   existing local owner/admin is all the same: 'admin' and below.
 * @ai-public registerRoleRoutes, canGrant
 * @ai-notes A `kind:'key'` actor (local API key, master included via its own
 *   `kind:'master'` branch) can never OWN a grant — only `kind:'account'`
 *   actors have an accountId. `username` on a grant is caller-supplied free
 *   text for readability only, same non-identity caveat as an API key's
 *   label — accountId is the only real key.
 */

type Handler = (req: Request, res: Response) => void | Promise<void>;

function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  };
}

/**
 * Whether `actor` may grant `targetTier` to someone. 'owner' is refused outright regardless
 * of who's asking. Master and a hub-global owner/admin (globalRole from introspect) get a
 * flat "anything up to admin" — this IS the Decision 4 "hub owners/admins bootstrap a
 * service's admins" behavior. Anyone else needs a local grant of their own and is bound by
 * canManage's strictly-below rule against their OWN local tier (peers refuse, unknown tiers
 * fail closed).
 */
export function canGrant(actor: BuilderActor, targetTier: ServiceTier, roleStore: RoleStore): boolean {
  if (targetTier === 'owner') return false;
  if (actor.kind === 'master') return true;
  if (actor.kind !== 'account') return false;
  if (actor.globalRole === 'owner' || actor.globalRole === 'admin') return true;
  return canManage(SERVICE_TIERS, roleStore.tierFor(actor.accountId), targetTier);
}

/** Loosest possible target ('user') stands in for "has ANY management standing at all" — used to gate the list view, which is less sensitive than granting but still operator data. */
function hasAnyManagementStanding(actor: BuilderActor, roleStore: RoleStore): boolean {
  return canGrant(actor, 'user', roleStore);
}

function granterLabel(actor: BuilderActor): string {
  switch (actor.kind) {
    case 'master':
      return 'master';
    case 'key':
      return `key:${actor.id} (${actor.label})`;
    case 'account':
      return actor.username ?? `account:${actor.accountId}`;
  }
}

export function registerRoleRoutes(
  app: Application,
  store: AuthStore,
  roleStore: RoleStore,
  config: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): void {
  // Scoped parser, same pattern as routes/auth.ts's /api/auth mount — registered here
  // rather than relying on registration order against registerAreaRoutes' app-wide one.
  app.use('/api/roles', express.json({ limit: '16kb' }));

  app.get(
    '/api/roles/me',
    requireAnyActor(store, config),
    safe((_req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      const localTier = actor.kind === 'account' ? roleStore.tierFor(actor.accountId) : null;
      const globalRole = actor.kind === 'account' ? (actor.globalRole ?? 'user') : null;
      res.json({ kind: actor.kind, localTier, globalRole });
    }),
  );

  app.get(
    '/api/roles',
    requireAnyActor(store, config),
    safe((_req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      if (!hasAnyManagementStanding(actor, roleStore)) {
        res.status(403).json({ error: 'managing roles requires hub owner/admin standing or a local admin-tier grant' });
        return;
      }
      res.json({ grants: roleStore.list() });
    }),
  );

  app.post(
    '/api/roles/:accountId',
    requireAnyActor(store, config),
    safe((req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      const body = req.body as { tier?: unknown; username?: unknown };
      if (!isServiceTier(body.tier)) {
        res.status(400).json({ error: `tier must be one of: ${SERVICE_TIERS.join(', ')}` });
        return;
      }
      if (body.tier === 'owner') {
        res.status(400).json({ error: "'owner' cannot be granted over HTTP — set it by editing roles.json on the host" });
        return;
      }
      if (!canGrant(actor, body.tier, roleStore)) {
        res.status(403).json({ error: 'you are not permitted to grant this tier' });
        return;
      }
      const accountId = String(req.params.accountId);
      const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim() : accountId;
      const grant = roleStore.setTier(accountId, username, body.tier, granterLabel(actor));
      res.json({ grant });
    }),
  );
}
