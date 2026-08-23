import type { Application, Request, Response } from 'express';
import type { ServerHealth } from '@shatteredarchive/types-server';

import type { AuthServerDeps } from './deps.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerKeysRoutes } from './routes/keys.js';
import { registerIntrospectRoutes } from './routes/introspect.js';
import { registerResolveUsernameRoutes } from './routes/resolve-username.js';
import { registerSsoRoutes } from './routes/sso.js';
import { registerTokenExchangeRoutes } from './routes/token-exchange.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerDeviceRoutes } from './routes/device.js';

/**
 * Registers all HTTP routes on the given Express app.
 *
 * Kept separate from the listener (index.ts) so tests can mount the routes on a
 * bare express() instance and exercise them in isolation.
 */
export function registerRoutes(app: Application, deps: AuthServerDeps): void {
  // Behind nginx in every deployed environment — req.ip should reflect X-Forwarded-For
  // (the per-IP challenge throttle in questions-store.ts depends on this).
  //
  // 1, NOT `true`. `true` trusts the WHOLE chain, which makes req.ip the LEFTMOST
  // X-Forwarded-For entry — and that entry is whatever the client sent, because each
  // nginx hop APPENDS rather than replaces. A client sending its own
  // `X-Forwarded-For: 9.9.9.9` therefore became 9.9.9.9 for every per-IP limiter here
  // (loginLockout, challengeThrottle, deviceRateLimiter, serviceRateLimiter), so all of
  // them were bypassable by rotating one header, and a victim's address could be forged
  // into lockout. Verified against proxy-addr directly, not assumed.
  //
  // 1 means "trust one hop" = take the LAST X-Forwarded-For entry, which is the value
  // the docker edge itself appended from its own $remote_addr — attacker-uncontrollable.
  // That is correct for BOTH routes into this server, which is why the count is 1 and not
  // the 2 the front-proxy chain would suggest:
  //   via front proxy   XFF = "<forged>, <client>, <client>"  -> last = client
  //   direct to edge    XFF = "<forged>, <client>"            -> last = client
  // The edge resolves the real client into $remote_addr via set_real_ip_from/
  // real_ip_recursive (deploy/nginx/edge-subdomains.conf), so its appended entry is
  // trustworthy in either case. With no proxy at all (tests, local dev) there is no XFF
  // and req.ip falls back to the socket address.
  //
  // nginx's own limit_req zones are unaffected either way — they key on
  // $binary_remote_addr, never on this header — so they remained the effective ceiling
  // throughout. This restores the app-level limiters to being a real second layer.
  app.set('trust proxy', 1);

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
  registerResolveUsernameRoutes(app, deps);
  registerSsoRoutes(app, deps);
  registerTokenExchangeRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerDeviceRoutes(app, deps);
}
