import type { Application, Request, Response } from 'express';
import type { ServerHealth } from '@shatteredarchive/types-server';

import { getMudBuilderConfig, type MudBuilderConfig } from './config.js';
import { AreaStore } from './area-store.js';
import { registerAreaRoutes } from './routes/areas.js';
import { registerReloadRoutes } from './routes/reload.js';

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
      mercAreaPath: config.areaPath,
    });
  });

  const store = new AreaStore(config.areaPath, config.writeEnabled);
  registerAreaRoutes(app, store);
  registerReloadRoutes(app, store);
}
