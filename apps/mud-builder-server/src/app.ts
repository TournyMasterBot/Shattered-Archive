import type { Application, Request, Response } from 'express';
import type { ServerHealth } from '@shatteredarchive/types-server';

import { getMudBuilderConfig, type MudBuilderConfig } from './config.js';
import { AreaStore } from './area-store.js';
import { registerAreaRoutes } from './routes/areas.js';
import { registerReloadRoutes } from './routes/reload.js';
import { registerWorldRoutes } from './routes/world.js';
import { registerMapRoutes } from './routes/map.js';
import { SkillsStore } from './skills-store.js';
import { registerSkillsRoutes } from './routes/skills.js';
import { GroupsStore } from './groups-store.js';
import { registerGroupsRoutes } from './routes/groups.js';
import { AuthStore } from './auth-store.js';
import { authGuard, registerAuthRoutes } from './routes/auth.js';
import { registerAuditViewRoutes } from './routes/audit-view.js';
import { registerImportRoutes } from './routes/import.js';
import { PresenceRegistry } from './presence.js';
import { registerPresenceRoutes } from './routes/presence.js';
import { auditMiddleware } from './audit.js';

/**
 * Registers all HTTP routes on the given Express app.
 *
 * Kept separate from the listener (index.ts) so tests can mount the routes on a
 * bare express() instance and exercise them in isolation.
 */
export function registerRoutes(app: Application, config: MudBuilderConfig = getMudBuilderConfig()): void {
  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'Hello from mud-builder-server' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });

  app.get('/api/capabilities', (_req: Request, res: Response) => {
    res.json({
      writeEnabled: config.writeEnabled,
      tokenRequired: config.authEnabled,
      mercAreaPath: config.areaPath,
    });
  });

  // Phase 9: guard + audit install BEFORE the routes so they see every request.
  // The guard 401s non-GET /api/* without a valid bearer; the audit middleware
  // records every accepted mutation. Credentials live under auth/ (Phase 12b),
  // the audit log stays under backups/ — both on the area bind mount.
  // Order matters: guard, then audit, then ANY route — a route registered
  // before the audit middleware would end the chain and never be audited.
  const authStore = config.authEnabled ? new AuthStore(config.authDataPath) : null;
  if (authStore) {
    authStore.init();
    app.use(authGuard(authStore));
  }
  if (config.writeEnabled) {
    app.use(auditMiddleware(config.auditDataPath));
  }
  if (authStore) {
    registerAuthRoutes(app, authStore, config);
    registerAuditViewRoutes(app, authStore, config.auditDataPath);
  }

  const store = new AreaStore(config.areaPath, config.writeEnabled);
  // Presence is advisory in-memory state: guarded (POST is mutation-shaped)
  // but never audited and independent of the write gate.
  registerPresenceRoutes(app, new PresenceRegistry());
  // Import routes carry their own scoped 2mb JSON parser and MUST register
  // before registerAreaRoutes' app-wide 1mb parser (first parser wins).
  registerImportRoutes(app, store);
  registerAreaRoutes(app, store);
  registerReloadRoutes(app, store);
  registerWorldRoutes(app, store);
  registerMapRoutes(app, store);
  registerSkillsRoutes(app, new SkillsStore(config.areaPath, config.writeEnabled));
  registerGroupsRoutes(app, new GroupsStore(config.areaPath, config.writeEnabled));
}
