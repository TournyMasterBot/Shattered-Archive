import type { Application, Request, Response } from 'express';
import type { ServerHealth } from '@shatteredarchive/types-server';

import type { AuthServerDeps } from './deps.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerKeysRoutes } from './routes/keys.js';
import { registerIntrospectRoutes } from './routes/introspect.js';
import { registerSsoRoutes } from './routes/sso.js';
import { registerTokenExchangeRoutes } from './routes/token-exchange.js';
import { registerAdminRoutes } from './routes/admin.js';

/**
 * Registers all HTTP routes on the given Express app.
 *
 * Kept separate from the listener (index.ts) so tests can mount the routes on a
 * bare express() instance and exercise them in isolation.
 */
export function registerRoutes(app: Application, deps: AuthServerDeps): void {
  // Behind nginx in every deployed environment — req.ip should reflect X-Forwarded-For
  // (the per-IP challenge throttle in questions-store.ts depends on this).
  app.set('trust proxy', true);

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'Hello from auth-server' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });

  registerAuthRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerKeysRoutes(app, deps);
  registerIntrospectRoutes(app, deps);
  registerSsoRoutes(app, deps);
  registerTokenExchangeRoutes(app, deps);
  registerAdminRoutes(app, deps);
}
