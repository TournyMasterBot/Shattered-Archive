import express, { type Application, type Request, type Response } from 'express';

import type { AuthStore, BuilderActor } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import type { SnippetStore, SnippetKind } from '../snippet-store.js';
import { requireAnyActor } from './auth.js';

/**
 * AI-ANNOTATION
 * @ai-summary Phase H: GET /api/user-content/summary — same route name as
 *   kingdom-tactics-server's own summary endpoint, for a uniform C# dashboard
 *   caller. `kind:'account'`-only, same as snippets.ts (a local key/master
 *   has no accountId to summarize) — 403, not a zeroed-out body.
 * @ai-public registerSummaryRoutes
 */

type Handler = (req: Request, res: Response) => void;

function safe(handler: Handler): Handler {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  };
}

export function registerSummaryRoutes(
  app: Application,
  store: AuthStore,
  snippetStore: SnippetStore,
  config: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath' | 'clientUrl'>,
): void {
  app.use('/api/user-content', express.json({ limit: '4kb' }));

  app.get(
    '/api/user-content/summary',
    requireAnyActor(store, config),
    safe((_req, res) => {
      const actor = res.locals.builderActor as BuilderActor;
      if (actor.kind !== 'account') {
        res.status(403).json({ error: 'this summary requires a centrally-authenticated account — a local key or the master key has none' });
        return;
      }
      const snippets = snippetStore.list(actor.accountId);
      const byKind: Record<SnippetKind, number> = { room: 0, mob: 0, object: 0, script: 0 };
      let updatedAt: string | null = null;
      for (const s of snippets) {
        byKind[s.kind]++;
        if (!updatedAt || s.updatedAt > updatedAt) updatedAt = s.updatedAt;
      }
      res.json({
        snippetCount: snippets.length,
        byKind,
        updatedAt,
        linkOutUrl: config.clientUrl ?? null,
      });
    }),
  );
}
