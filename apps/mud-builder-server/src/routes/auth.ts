import express, { type Application, type Request, type RequestHandler, type Response } from 'express';

import { AuthError, type AuthStore } from '../auth-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Builder auth (Phase 9): the global write guard (non-GET /api/*
 *   requires a valid bearer — master key or active API key) and the master-only
 *   key-management routes (/api/auth/keys list/create/rotate/revoke,
 *   /api/auth/rotate-master). Plaintext tokens appear only in create/rotate
 *   responses — shown once, never stored, never logged.
 * @ai-public authGuard, registerAuthRoutes
 * @ai-notes Key management requires the MASTER key even for GET — key metadata
 *   is operator data, not game data, so the "reads stay open" rule does not
 *   apply under /api/auth.
 */

const SHOW_ONCE_NOTE = 'store this token now — it is shown only once and only a hash is kept';

function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

/**
 * Global write guard: every mutating request requires a valid builder token.
 * Deliberately method-based with NO path filter — Express route matching is
 * case-insensitive by default, so a path check like startsWith('/api/') can
 * be sidestepped with '/API/…' while the route still matches. Reads (GET/
 * HEAD) and preflight stay open; this server serves nothing else mutable.
 */
export function authGuard(store: AuthStore): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const actor = store.verify(bearerToken(req));
    if (!actor) {
      res.status(401).json({ error: 'a valid builder token is required (Authorization: Bearer <token>)' });
      return;
    }
    res.locals.builderActor = actor;
    next();
  };
}

/** Master-only gate — used under /api/auth and by the audit viewer (operator data). */
export function requireMaster(store: AuthStore): RequestHandler {
  return (req, res, next) => {
    const actor = store.verify(bearerToken(req));
    if (!actor) {
      res.status(401).json({ error: 'a valid builder token is required (Authorization: Bearer <token>)' });
      return;
    }
    if (actor.kind !== 'master') {
      res.status(403).json({ error: 'key management requires the master key' });
      return;
    }
    res.locals.builderActor = actor;
    next();
  };
}

type Handler = (req: Request, res: Response) => void | Promise<void>;

function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof AuthError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  };
}

function requireIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) throw new AuthError('key id is required', 400);
  return id;
}

function requireLabel(req: Request): string {
  const body = req.body as { label?: unknown } | undefined;
  const label = body && typeof body === 'object' ? body.label : undefined;
  if (typeof label !== 'string' || label.trim().length === 0 || label.trim().length > 64) {
    throw new AuthError('request body must be JSON: { "label": "<1-64 chars>" }', 400);
  }
  return label.trim();
}

export function registerAuthRoutes(app: Application, store: AuthStore): void {
  // Scoped to /api/auth: an app-wide parser here would cap EVERY later
  // route's body at 64kb (first parser wins), breaking large area saves.
  app.use('/api/auth', express.json({ limit: '64kb' }));
  app.use('/api/auth', requireMaster(store));

  app.get(
    '/api/auth/keys',
    safe((_req, res) => {
      res.json({ keys: store.listKeys() });
    }),
  );

  app.post(
    '/api/auth/keys',
    safe((req, res) => {
      const created = store.createKey(requireLabel(req));
      res.status(201).json({ ...created, note: SHOW_ONCE_NOTE });
    }),
  );

  app.post(
    '/api/auth/keys/:id/rotate',
    safe((req, res) => {
      const rotated = store.rotateKey(requireIdParam(req));
      res.json({ ...rotated, note: SHOW_ONCE_NOTE });
    }),
  );

  app.delete(
    '/api/auth/keys/:id',
    safe((req, res) => {
      res.json({ ...store.revokeKey(requireIdParam(req)), revoked: true });
    }),
  );

  app.post(
    '/api/auth/rotate-master',
    safe((_req, res) => {
      const { token } = store.rotateMaster();
      res.json({ token, note: `${SHOW_ONCE_NOTE}; the old master key is now invalid` });
    }),
  );
}
