import express, { type Application, type Request, type Response } from 'express';

import type { SimulacrumConfig } from '../config.js';
import { checkEngineActionEligibility } from '../engine-auth.js';
import { EngineRebuildStore } from '../engine-rebuild.js';
import { EngineReloadError, EngineReloadWriter } from '../engine-reload.js';
import type { RoleStore } from '../role-store.js';

/**
 * AI-ANNOTATION
 * @ai-summary Engine-management routes: POST /api/engine/reload (hot|copyover — pure file
 *   signal, zero docker), POST /api/engine/rebuild (docker compose build+recreate of
 *   mercmud24 ONLY — see engine-rebuild.ts for why nothing else is reachable), GET
 *   /api/engine/status. All three require builder+ tier; rebuild additionally requires a
 *   short-lived token (engine-auth.ts). Auth ordering is deliberate: identity -> 401 ->
 *   tier/eligibility -> 403 -> feature-enabled flag -> 501, mirroring mud-builder-server's
 *   routes/rebuild.ts comment on why the enabled-check runs LAST — an unauthenticated or
 *   ineligible caller must never learn whether a feature is even turned on.
 * @ai-public registerEngineRoutes
 */

interface AccountLike {
  accountId: string;
  username: string;
  expiresAt?: string | null;
}

type ResolveAccount = (token: string) => Promise<AccountLike | null>;

export function registerEngineRoutes(
  app: Application,
  config: Pick<SimulacrumConfig, 'engineReloadEnabled' | 'engineRebuildEnabled' | 'engineAreaPath' | 'mercMudRepoPath' | 'mercMudHostPath'>,
  roleStore: RoleStore,
  resolveAccount: ResolveAccount,
  tokenFromRequest: (req: Request) => string,
  rebuildStore: EngineRebuildStore = new EngineRebuildStore({
    mercMudRepoPath: config.mercMudRepoPath,
    mercMudHostPath: config.mercMudHostPath,
  }),
): void {
  const reloadWriter = new EngineReloadWriter(config.engineAreaPath, config.engineReloadEnabled);

  // Scoped to /api/engine: an app-wide parser would cap every other route's body too
  // (first parser wins), same reasoning routes/auth.ts documents for its own scoping.
  app.use('/api/engine', express.json({ limit: '8kb' }));

  async function requireEligibleAccount(
    req: Request,
    res: Response,
    requireShortLivedToken: boolean,
  ): Promise<AccountLike | null> {
    const account = await resolveAccount(tokenFromRequest(req));
    if (!account) {
      res.status(401).json({ error: 'sign in required' });
      return null;
    }
    const eligibility = checkEngineActionEligibility(account, roleStore, requireShortLivedToken);
    if (!eligibility.allowed) {
      res.status(403).json({ error: eligibility.reason });
      return null;
    }
    return account;
  }

  app.post('/api/engine/reload', async (req: Request, res: Response) => {
    const account = await requireEligibleAccount(req, res, false);
    if (!account) return;
    if (!config.engineReloadEnabled) {
      res.status(501).json({ error: 'engine reload is not enabled on this deployment (SIMULACRUM_ENGINE_RELOAD_ENABLED)' });
      return;
    }
    try {
      const body = (req.body ?? {}) as { mode?: string; file?: string };
      const mode = body.mode ?? 'hot';
      if (mode !== 'hot' && mode !== 'copyover') {
        res.status(400).json({ error: `mode must be "hot" or "copyover" (got ${JSON.stringify(mode)})` });
        return;
      }
      const { signalPath } = reloadWriter.requestReload(mode, body.file);
      res.status(202).json({ mode, signalPath, note: 'signal written; the engine applies it on its next pulse' });
    } catch (e) {
      if (e instanceof EngineReloadError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });

  app.post('/api/engine/rebuild', async (req: Request, res: Response) => {
    const account = await requireEligibleAccount(req, res, true);
    if (!account) return;
    if (!config.engineRebuildEnabled) {
      res.status(501).json({ error: 'engine rebuild is not enabled on this deployment (SIMULACRUM_ENGINE_REBUILD_ENABLED)' });
      return;
    }
    if (rebuildStore.isRunning()) {
      res.status(409).json({ error: 'a rebuild is already in progress' });
      return;
    }
    // Fire-and-forget, same idiom as mud-builder-server's routes/rebuild.ts: 202 now,
    // GET /api/engine/status reports progress from here on.
    void rebuildStore.runPipeline(account.username).catch((e: unknown) => {
      console.error(`[engine-rebuild] pipeline failed: ${(e as Error).message}`);
    });
    res.status(202).json({ note: 'rebuild started; poll GET /api/engine/status for progress' });
  });

  app.get('/api/engine/status', async (req: Request, res: Response) => {
    // Informational only — never enforced here, so the client can hide a trigger button
    // entirely for an ineligible caller rather than show it and let the click 403.
    const account = await resolveAccount(tokenFromRequest(req));
    const reloadEligible = account !== null && checkEngineActionEligibility(account, roleStore, false).allowed;
    const rebuildEligible = account !== null && checkEngineActionEligibility(account, roleStore, true).allowed;
    res.json({
      rebuild: rebuildStore.read(),
      canReload: config.engineReloadEnabled && reloadEligible,
      canRebuild: config.engineRebuildEnabled && rebuildEligible,
    });
  });
}
