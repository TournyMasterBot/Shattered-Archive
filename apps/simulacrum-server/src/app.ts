import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express, { type Application, type Request, type Response } from 'express';
import type { ServerHealth } from '@shatteredarchive/types-server';
import { introspect, matchesAudience, SERVICE_TIERS, tierRank } from '@shatteredarchive/services-server';

import type { SimulacrumConfig } from './config.js';
import { mintAccessCode } from './access-codes.js';
import { readCookieToken, registerSsoRoutes } from './sso.js';
import type { RoleStore } from './role-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Express surface for simulacrum-server (Step 1): /health, the SSO sign-in
 *   hand-off (sso.ts), POST /api/access-code (the ONE auth-gated route in this whole
 *   effort — trusted+ only), GET /api/whoami (lets the static page render sign-in state),
 *   and the static page itself. NOT the TCP relay — that's relay.ts, a separate listener
 *   index.ts starts alongside this one.
 * @ai-public registerRoutes
 * @ai-notes This service has no local key store (Constraints: only centrally-authenticated
 *   accounts matter) — resolveAccount is introspect-only, unlike mud-builder-server's
 *   local-first resolveActor.
 */

const INTROSPECT_SERVICE_NAME = 'simulacrum-server';
const INTROSPECT_TIMEOUT_MS = 3_000;

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

function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

interface Account {
  accountId: string;
  username: string;
}

/** Introspect-only account resolution — no local key store exists for this service to check first. */
export async function resolveAccount(
  config: Pick<SimulacrumConfig, 'authServerUrl' | 'servicePrivateKeyPath'>,
  token: string,
): Promise<Account | null> {
  if (!token || !config.authServerUrl || !config.servicePrivateKeyPath) return null;
  try {
    const privateKeyPem = fs.readFileSync(config.servicePrivateKeyPath, 'utf8');
    const result = await withTimeout(
      introspect(config.authServerUrl, INTROSPECT_SERVICE_NAME, privateKeyPem, token),
      INTROSPECT_TIMEOUT_MS,
    );
    if (!matchesAudience(result, INTROSPECT_SERVICE_NAME) || !result.accountId) return null;
    return { accountId: result.accountId, username: result.username ?? result.accountId };
  } catch {
    return null;
  }
}

function tokenFromRequest(req: Request): string {
  return bearerToken(req) || readCookieToken(req) || '';
}

export function registerRoutes(app: Application, config: SimulacrumConfig, roleStore: RoleStore): void {
  app.get('/health', (_req: Request, res: Response) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });

  registerSsoRoutes(app, config);

  app.get('/api/whoami', async (req: Request, res: Response) => {
    const account = await resolveAccount(config, tokenFromRequest(req));
    if (!account) {
      res.json({ signedIn: false });
      return;
    }
    res.json({ signedIn: true, username: account.username, tier: roleStore.tierFor(account.accountId) });
  });

  app.post('/api/access-code', async (req: Request, res: Response) => {
    const account = await resolveAccount(config, tokenFromRequest(req));
    if (!account) {
      res.status(401).json({ error: 'sign in required' });
      return;
    }
    const tier = roleStore.tierFor(account.accountId);
    if (tierRank(SERVICE_TIERS, tier) > tierRank(SERVICE_TIERS, 'trusted')) {
      res.status(403).json({
        error:
          'trusted tier or above is required — this is a separate, per-service grant from any Shattered Archive account role. Ask an admin, or if you already have hub owner/admin standing, grant it to yourself from the Roles tab at build.shatteredarchive.dev.',
      });
      return;
    }
    const code = mintAccessCode(config.accessCodesPath, account.accountId, account.username, config.accessCodeTtlMs);
    res.status(201).json({ code, expiresInMs: config.accessCodeTtlMs });
  });

  // simulacrum's ONE UI surface (Constraints: never a game-client addition).
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
  app.use(express.static(publicDir));
}
