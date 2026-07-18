import express, { type Application, type Request, type Response } from 'express';

import { AreaStoreError, assertValidAreaFileName } from '../area-store.js';
import type { BuilderActor } from '../auth-store.js';
import { PRESENCE_TTL_MS, type PresenceRegistry } from '../presence.js';

/**
 * AI-ANNOTATION
 * @ai-summary Advisory presence routes (Phase 11): POST /api/presence { file }
 *   heartbeats "this credential is editing this area" (guarded like any
 *   mutation when auth is on); GET /api/presence lists live entries (open).
 * @ai-public registerPresenceRoutes
 * @ai-notes The editing name comes from the acting credential (key label or
 *   "master"), never from client input; "anonymous" appears only when auth is
 *   off (local testing). Never audited — transient, not a disk mutation.
 */

export function registerPresenceRoutes(app: Application, registry: PresenceRegistry): void {
  // Scoped parser: presence registers before the app-wide parser (a heartbeat body is tiny).
  app.use('/api/presence', express.json({ limit: '4kb' }));

  app.get('/api/presence', (_req: Request, res: Response) => {
    res.json({ entries: registry.list(), ttlSeconds: PRESENCE_TTL_MS / 1000 });
  });

  app.post('/api/presence', (req: Request, res: Response) => {
    try {
      const { file } = (req.body ?? {}) as { file?: unknown };
      if (typeof file !== 'string') {
        throw new AreaStoreError('request body must be JSON: { "file": "<name>.are" }', 400);
      }
      assertValidAreaFileName(file);
      const actor = res.locals.builderActor as BuilderActor | undefined;
      const name = actor ? (actor.kind === 'master' ? 'master' : actor.label) : 'anonymous';
      registry.heartbeat(file, name);
      // name comes back so the client can tell its own entries apart in lists
      res.json({ ok: true, ttlSeconds: PRESENCE_TTL_MS / 1000, name });
    } catch (e) {
      if (e instanceof AreaStoreError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });
}
