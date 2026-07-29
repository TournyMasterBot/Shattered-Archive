import type { Application, Request, Response } from 'express';

import type { AuthStore, BuilderActor } from '../auth-store.js';
import type { MudBuilderConfig } from '../config.js';
import { RebuildStore } from '../rebuild-store.js';
import type { RoleStore } from '../role-store.js';
import { checkRebuildEligibility, requireAnyActor, requireRebuildAllowed } from './auth.js';

/**
 * AI-ANNOTATION
 * @ai-summary Phase 15: POST /api/rebuild triggers the engine-rebuild pipeline
 *   (rebuild-store.ts) in the background — 202 immediately, same idiom as
 *   reload.ts. GET /api/rebuild/status reports current/last-run progress.
 * @ai-public registerRebuildRoutes
 */

type Handler = (req: Request, res: Response) => void | Promise<void>;

/** No custom error type here (unlike routes/auth.ts's AuthError) — this route's own logic never throws a typed error; this only guards against a genuinely unexpected failure becoming an unhandled rejection. */
function safe(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      res.status(500).json({ error: `internal error: ${(e as Error).message}` });
    }
  };
}

function describeActor(actor: BuilderActor | undefined): string {
  if (!actor) return 'anonymous';
  switch (actor.kind) {
    case 'master':
      return 'master';
    case 'key':
      return `key:${actor.id} (${actor.label})`;
    case 'account':
      return actor.username ?? `account:${actor.accountId}`;
  }
}

export function registerRebuildRoutes(
  app: Application,
  store: AuthStore,
  config: Pick<
    MudBuilderConfig,
    | 'authServerUrl'
    | 'servicePrivateKeyPath'
    | 'rebuildEnabled'
    | 'areaPath'
    | 'mercMudRepoPath'
    | 'mercMudHostPath'
    | 'shatteredArchiveRepoPath'
    | 'shatteredArchiveHostPath'
  >,
  roleStore: RoleStore,
  rebuildStore: RebuildStore = new RebuildStore(config),
): void {
  app.post(
    '/api/rebuild',
    requireRebuildAllowed(store, config, roleStore),
    safe((req, res) => {
      // Checked AFTER the guard, deliberately — an unauthenticated/non-allowlisted caller
      // gets the normal 401/403 either way, never learns whether this is even turned on.
      if (!config.rebuildEnabled) {
        res.status(501).json({ error: 'the engine-rebuild feature is not enabled on this deployment (MUD_REBUILD_ENABLED)' });
        return;
      }
      if (rebuildStore.isRunning()) {
        res.status(409).json({ error: 'a rebuild is already in progress' });
        return;
      }
      const actor = describeActor(res.locals.builderActor as BuilderActor | undefined);
      // Fire-and-forget: the pipeline's own status.json is the source of truth from here
      // on, since this process may not survive to the end of the pipeline (Step 6).
      void rebuildStore.runPipeline(actor).catch((e: unknown) => {
        console.error(`[rebuild] pipeline failed: ${(e as Error).message}`);
      });
      res.status(202).json({ note: 'rebuild started; poll GET /api/rebuild/status for progress' });
    }),
  );

  app.get(
    '/api/rebuild/status',
    requireAnyActor(store, config),
    safe((_req, res) => {
      // Informational only (never enforced here — requireRebuildAllowed enforces it on
      // the actual POST) so the client can hide the trigger button entirely for a caller
      // who isn't rebuild-eligible, rather than show it and let the click 403.
      const actor = res.locals.builderActor as BuilderActor;
      const eligibility = checkRebuildEligibility(actor, roleStore);
      res.json({ status: rebuildStore.read(), canTrigger: config.rebuildEnabled && eligibility.allowed });
    }),
  );
}
