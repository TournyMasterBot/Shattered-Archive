import fs from 'fs';

import express, { type Application, type Request, type RequestHandler, type Response } from 'express';
import { introspect } from '@shatteredarchive/services-server';

import { SERVICE_TIERS, tierRank } from '@shatteredarchive/services-server';

import { AuthError, type AuthStore, type BuilderActor } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import type { RoleStore } from '../role-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Builder auth (Phase 9): the global write guard (non-GET /api/*
 *   requires a valid bearer — master key, active local API key, or (Phase 4) a
 *   centrally-issued account key that passes introspection against auth-server)
 *   and the master-only key-management routes (/api/auth/keys list/create/
 *   rotate/revoke, /api/auth/rotate-master). Plaintext tokens appear only in
 *   create/rotate responses — shown once, never stored, never logged.
 * @ai-public authGuard, requireMaster, registerAuthRoutes
 * @ai-notes Key management requires the MASTER key even for GET — key metadata
 *   is operator data, not game data, so the "reads stay open" rule does not
 *   apply under /api/auth. The Phase 4 introspect fallback is local-first and
 *   opt-in: a token the local store recognizes never touches the network, and
 *   with no authServerUrl/servicePrivateKeyPath configured behavior is
 *   byte-identical to pre-Phase-4. requireMaster ALSO falls back to
 *   introspection (added after a real bug: a valid account actor used to land
 *   in requireMaster's bare 401 bucket instead of the 403 "not master" bucket,
 *   which mud-builder-client's AccessPage status probe reads as "token
 *   REJECTED" — the account key worked everywhere else, just looked broken in
 *   the Access tab).
 */

const SHOW_ONCE_NOTE = 'store this token now — it is shown only once and only a hash is kept';

// The identity mud-builder-server registers under with auth-server's `register-service` script.
const INTROSPECT_SERVICE_NAME = 'mud-builder-server';

// Bounds the Phase 4 fallback call so a hung/unreachable auth-server 401s instead of hanging
// the request. Local-store tokens (master/API key) never reach this path at all.
const INTROSPECT_TIMEOUT_MS = 3_000;

// Phase 15: requireRebuildAllowed's cap on how far in the future an account token's
// expiresAt may be — a "forever" or long-lived key must not unlock the rebuild trigger.
const REBUILD_MAX_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Phase 4: a token the local store doesn't recognize may still be a real, centrally-issued
 * account key (minted via auth-client's `POST /api/keys {service:'mud-builder-server'}`) —
 * check it against auth-server before giving up. Never throws: unconfigured, an unreadable
 * key file, a network error, a timeout, or `{valid:false}` all just mean "not an account
 * actor", leaving the caller to 401 exactly as it did before this existed.
 */
async function tryIntrospect(
  config: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
  token: string,
): Promise<BuilderActor | null> {
  if (!config.authServerUrl || !config.servicePrivateKeyPath) return null;
  try {
    const privateKeyPem = fs.readFileSync(config.servicePrivateKeyPath, 'utf8');
    const result = await withTimeout(
      introspect(config.authServerUrl, INTROSPECT_SERVICE_NAME, privateKeyPem, token),
      INTROSPECT_TIMEOUT_MS,
    );
    if (!result.valid) return null;
    return {
      kind: 'account',
      accountId: result.accountId ?? '',
      label: result.label ?? result.accountId ?? 'account',
      username: result.username,
      expiresAt: result.expiresAt,
      globalRole: result.globalRole,
    };
  } catch {
    return null;
  }
}

/** Shared by every guard below: local-first (store.verify(), no I/O beyond the already-cached auth file), falling through to the Phase 4 introspect fallback only on a local miss — master-key and local-API-key holders never pay a network round trip or depend on auth-server being reachable. */
async function resolveActor(
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
  req: Request,
): Promise<BuilderActor | null> {
  const token = bearerToken(req);
  return store.verify(token) ?? (token ? await tryIntrospect(introspectConfig, token) : null);
}

/**
 * Global write guard: every mutating request requires a valid builder token.
 * Deliberately method-based with NO path filter — Express route matching is
 * case-insensitive by default, so a path check like startsWith('/api/') can
 * be sidestepped with '/API/…' while the route still matches. Reads (GET/
 * HEAD) and preflight stay open; this server serves nothing else mutable —
 * EXCEPT GET /api/rebuild/status (Phase 15), which is operationally sensitive
 * output and gets its own explicit guard (requireAnyActor) at registration.
 */
export function authGuard(
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): RequestHandler {
  return async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const actor = await resolveActor(store, introspectConfig, req);
    if (!actor) {
      res.status(401).json({ error: 'a valid builder token is required (Authorization: Bearer <token>)' });
      return;
    }
    res.locals.builderActor = actor;
    next();
  };
}

/**
 * Phase 15: any recognized actor (master, local key, or a centrally-verified account —
 * NOT allowlist-gated) — for routes that are readable-but-sensitive rather than fully
 * open (GET /api/rebuild/status: operationally sensitive output, not open-GET
 * game-content territory) but don't need the rebuild trigger's own narrower gate.
 */
export function requireAnyActor(
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): RequestHandler {
  return async (req, res, next) => {
    const actor = await resolveActor(store, introspectConfig, req);
    if (!actor) {
      res.status(401).json({ error: 'a valid builder token is required (Authorization: Bearer <token>)' });
      return;
    }
    res.locals.builderActor = actor;
    next();
  };
}

/**
 * Master-only gate — used under /api/auth and by the audit viewer (operator data).
 * Falls back to introspection like authGuard: a valid account actor that ISN'T master
 * still needs to resolve to a REAL actor (403 "key management requires the master key"),
 * not a bare 401 — the client's status probe (mud-builder-client's AccessPage, GET
 * /api/auth/keys) distinguishes "a recognized non-master credential" (403 → shows the
 * ordinary "key accepted, saves enabled" status) from "nothing valid at all" (401 →
 * shows "token was REJECTED"). Before this fell back to introspection, a real,
 * introspection-valid account key landed in the 401 bucket and looked rejected in the
 * UI even though it authenticated saves fine everywhere else.
 */
export function requireMaster(
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): RequestHandler {
  return async (req, res, next) => {
    const actor = await resolveActor(store, introspectConfig, req);
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

export type RebuildEligibility = { allowed: true } | { allowed: false; reason: string };

/**
 * Phase 15, retargeted Phase G: the actual eligibility rule for the engine-rebuild
 * trigger, as a pure predicate — shared by requireRebuildAllowed (enforces it on POST
 * /api/rebuild) and GET /api/rebuild/status (reports it, informationally, as
 * `canTrigger`, so the client can hide the trigger button entirely rather than show it
 * and let it 403).
 *
 * Passes for kind:'master', or kind:'account' with a local role-store tier of 'admin' or
 * 'owner' AND an expiresAt present and no more than 7 days out — a "forever" or
 * long-lived account key must not unlock this action even once the account holds
 * admin-tier standing (the plan's Constraints scope the short-lived-token requirement to
 * THIS check only, not a global API-key policy change — unchanged from Phase 15). Any
 * kind:'key' actor (a local API key, master or not) fails outright — a key's label is
 * free text typed at mint time, never a valid identity check; only a centrally-verified
 * accountId is. An already genuinely-expired token can never reach the expiresAt check
 * below at all: introspect only returns a valid actor for a token auth-server's own
 * KeyStore.verify() accepted, which already rejects expired keys — so "too far in the
 * future" is the only expiry failure mode possible here.
 *
 * Phase G retired the static MUD_REBUILD_ALLOWED_USERNAMES env-var allowlist this
 * replaced — granting access no longer needs a redeploy, see routes/roles.ts.
 */
export function checkRebuildEligibility(actor: BuilderActor, roleStore: RoleStore): RebuildEligibility {
  if (actor.kind === 'master') return { allowed: true };
  if (actor.kind !== 'account') {
    return { allowed: false, reason: 'this action requires an account with admin tier or above' };
  }
  const tier = roleStore.tierFor(actor.accountId);
  if (tierRank(SERVICE_TIERS, tier) > tierRank(SERVICE_TIERS, 'admin')) {
    return { allowed: false, reason: 'this action requires admin tier or above (see the Roles tab)' };
  }
  if (!actor.expiresAt) {
    return {
      allowed: false,
      reason: 'this action requires a short-lived token (expiring within 7 days) — a forever key is not accepted',
    };
  }
  const expiresAtMs = Date.parse(actor.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs > Date.now() + REBUILD_MAX_TOKEN_TTL_MS) {
    return { allowed: false, reason: 'this action requires a token expiring within 7 days' };
  }
  return { allowed: true };
}

/** Gates the engine-rebuild trigger itself — enforces checkRebuildEligibility() as a hard 403. */
export function requireRebuildAllowed(
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
  roleStore: RoleStore,
): RequestHandler {
  return async (req, res, next) => {
    const actor = await resolveActor(store, introspectConfig, req);
    if (!actor) {
      res.status(401).json({ error: 'a valid builder token is required (Authorization: Bearer <token>)' });
      return;
    }
    const eligibility = checkRebuildEligibility(actor, roleStore);
    if (!eligibility.allowed) {
      res.status(403).json({ error: eligibility.reason });
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

export function registerAuthRoutes(
  app: Application,
  store: AuthStore,
  introspectConfig: Pick<MudBuilderConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
): void {
  // Scoped to /api/auth: an app-wide parser here would cap EVERY later
  // route's body at 64kb (first parser wins), breaking large area saves.
  app.use('/api/auth', express.json({ limit: '64kb' }));
  app.use('/api/auth', requireMaster(store, introspectConfig));

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

  /**
   * Phase 2 (centralized auth service): a small, additive, master-only proof
   * that the Ed25519 introspect mechanism works end to end against a real
   * registered service key — NOT a replacement for the builder token guard
   * above, which keeps gating every mutation exactly as before.
   */
  app.get(
    '/api/auth/introspect-check',
    safe(async (req, res) => {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      if (!token) throw new AuthError('query param "token" is required', 400);
      if (!introspectConfig.authServerUrl || !introspectConfig.servicePrivateKeyPath) {
        throw new AuthError(
          'introspect-check is not configured: set AUTH_SERVER_URL and SERVICE_PRIVATE_KEY_PATH',
          501,
        );
      }
      let privateKeyPem: string;
      try {
        privateKeyPem = fs.readFileSync(introspectConfig.servicePrivateKeyPath, 'utf8');
      } catch (e) {
        throw new AuthError(`cannot read SERVICE_PRIVATE_KEY_PATH: ${(e as Error).message}`, 500);
      }
      try {
        const result = await introspect(introspectConfig.authServerUrl, INTROSPECT_SERVICE_NAME, privateKeyPem, token);
        res.json(result);
      } catch (e) {
        // A wrong/unregistered key surfaces here as auth-server's 401 wrapped in introspect()'s Error — never a crash.
        throw new AuthError(`introspect call failed: ${(e as Error).message}`, 502);
      }
    }),
  );
}
