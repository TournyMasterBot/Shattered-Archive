import express, { type Application, type Request, type Response } from 'express';
import { SERVICE_TIERS, tierRank } from '@shatteredarchive/services-server';

import type { AuthStore, BuilderActor } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import type { RoleStore } from '../role-store.js';
import { SnippetStore, type Snippet } from '../snippet-store.js';
import { requireAnyActor } from './auth.js';

/**
 * AI-ANNOTATION
 * @ai-summary Phase G: GET/PUT /api/snippets — whole-collection read/replace
 *   over a builder's own private Room/Mob/Object/Script templates, keyed by
 *   accountId. Only a `kind:'account'` actor can own snippets (a local API
 *   key/master has no accountId to key a file on) — 403, not a silently
 *   empty list, so the client can tell "not for you" from "you have none
 *   yet." Simulacrum-wiring correction 5: floored at `trusted` tier or
 *   above — bare `user` tier can no longer draft snippets either, matching
 *   "trusted users can create content" (a plain `user` account has no
 *   content-creation surface left at all, since the real area files require
 *   `builder`+ via `authGuard`).
 * @ai-public registerSnippetRoutes
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

function isSnippetShape(value: unknown): value is Snippet {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    (s.kind === 'room' || s.kind === 'mob' || s.kind === 'object' || s.kind === 'script') &&
    typeof s.name === 'string' &&
    s.name.trim().length > 0 &&
    typeof s.createdAt === 'string' &&
    typeof s.updatedAt === 'string'
  );
}

function requireTrustedAccount(
  actor: BuilderActor,
  roleStore: RoleStore,
  res: Response,
): actor is Extract<BuilderActor, { kind: 'account' }> {
  if (actor.kind !== 'account') {
    res.status(403).json({ error: 'snippets require a centrally-authenticated account — a local key or the master key has none' });
    return false;
  }
  const tier = roleStore.tierFor(actor.accountId);
  if (tierRank(SERVICE_TIERS, tier) > tierRank(SERVICE_TIERS, 'trusted')) {
    res.status(403).json({ error: 'snippets require trusted tier or above (see the Roles tab)' });
    return false;
  }
  return true;
}

export function registerSnippetRoutes(
  app: Application,
  store: AuthStore,
  snippetStore: SnippetStore,
  roleStore: RoleStore,
  config: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): void {
  app.use('/api/snippets', express.json({ limit: '2mb' }));

  app.get(
    '/api/snippets',
    requireAnyActor(store, config),
    safe((_req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      if (!requireTrustedAccount(actor, roleStore, res)) return;
      res.json({ snippets: snippetStore.list(actor.accountId) });
    }),
  );

  app.put(
    '/api/snippets',
    requireAnyActor(store, config),
    safe((req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      if (!requireTrustedAccount(actor, roleStore, res)) return;
      const body = req.body as { snippets?: unknown };
      if (!Array.isArray(body.snippets) || !body.snippets.every(isSnippetShape)) {
        res.status(400).json({ error: 'snippets must be an array of {id, kind, name, data, createdAt, updatedAt}' });
        return;
      }
      const saved = snippetStore.save(actor.accountId, body.snippets);
      res.json({ snippets: saved });
    }),
  );
}
