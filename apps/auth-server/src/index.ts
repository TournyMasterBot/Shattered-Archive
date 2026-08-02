import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import express from 'express';

import { logger } from './logger.js';
import { getAuthServerConfig } from './config.js';
import { loadDataKey } from './crypto-primitives.js';
import { registerRoutes } from './app.js';
import { AccountStore } from './account-store.js';
import { KeyStore } from './key-store.js';
import { DeviceStore } from './device-store.js';
import { DeviceNonceStore } from './device-nonce-store.js';
import { QuestionsStore, ChallengeThrottle } from './questions-store.js';
import { ServiceKeyStore } from './service-key-store.js';
import { SsoCodeStore } from './sso-code-store.js';
import { AuditLog } from './audit-log.js';
import { LoginLockout } from './login-lockout.js';
import { createMailer } from './mailer.js';
import { RateLimiter } from './rate-limit.js';
import { reconcileServiceRegistry } from './service-registry-reconciler.js';
import type { AuthServerDeps } from './deps.js';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  logger.warn(`[auth-server] No .env file found; using defaults`, { baseEnvFile });
}

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  logger.debug(`[auth-server] Loaded environment overrides`, { envFile });
}

const config = getAuthServerConfig();

// Boot must FAIL FAST — never start serving requests with a broken/absent
// encryption key (see crypto-primitives.ts's loadDataKey precedence).
let dataKey: Buffer;
try {
  dataKey = loadDataKey();
} catch (e) {
  logger.error(`[auth-server] Failed to start: no usable data encryption key`, { error: (e as Error).message });
  process.exit(1);
}

const deps: AuthServerDeps = {
  accountStore: new AccountStore(config.dataDir, dataKey),
  keyStore: new KeyStore(config.dataDir, dataKey),
  deviceStore: new DeviceStore(config.dataDir, dataKey),
  deviceNonceStore: new DeviceNonceStore(),
  questionsStore: new QuestionsStore(config.dataDir),
  serviceKeyStore: new ServiceKeyStore(config.dataDir, dataKey),
  ssoCodeStore: new SsoCodeStore(),
  challengeThrottle: new ChallengeThrottle(),
  loginLockout: new LoginLockout(),
  mailer: createMailer(config),
  auditLog: new AuditLog(config.dataDir),
  publicOrigin: config.publicOrigin,
  deviceAllowedOrigins: config.deviceAllowedOrigins,
  deviceOriginServices: config.deviceOriginServices,
  deviceGrantRequiredServices: config.deviceGrantRequiredServices,
  // Burst set WIDER than nginx's matching device_auth zone (burst=30) on purpose, so the edge
  // always sheds first and this only ever fires for traffic that bypassed it. See rate-limit.ts.
  deviceRateLimiter: {
    perIp: new RateLimiter({ ratePerMinute: 120, burst: 40 }),
    perDevice: new RateLimiter({ ratePerMinute: 60, burst: 20 }),
  },
  // No edge zone backs these: consumer services call introspect/token-exchange at the internal
  // alias, so nginx never sees them. Sized as a runaway ceiling rather than traffic shaping —
  // introspect runs on the hot path of every authenticated request to every consumer service,
  // so tripping this in normal operation would mean something is wrong, not merely busy.
  serviceRateLimiter: {
    perIp: new RateLimiter({ ratePerMinute: 12_000, burst: 2_000 }),
    perService: new RateLimiter({ ratePerMinute: 6_000, burst: 1_000 }),
  },
};

// A misconfigured origin map fails closed (that origin cannot enroll), so it must be visible
// in the log rather than presenting as an unexplained enrollment failure.
for (const warning of config.deviceConfigWarnings) {
  logger.warn(`[auth-server] ${warning}`);
}

/**
 * Declarative service provisioning — replaces the manual register-service /
 * register-redirect-uri ceremony a deployment used to require.
 *
 * Runs at boot AND on a timer. The timer is what makes container start order
 * irrelevant: a consuming service that boots after this one publishes its public key
 * a few seconds later, and the next pass registers it with no human involved. Polling
 * rather than fs.watch on purpose — the directory is a shared docker volume, and
 * inotify across those is not dependable enough to be the only trigger.
 *
 * Cheap enough to poll: it reads a small directory and the store's own cached data,
 * and reconcile() writes ONLY when something actually changed, so a converged system
 * does no I/O beyond the directory listing and logs nothing.
 */
const RECONCILE_INTERVAL_MS = 30_000;

function runServiceRegistryReconcile(firstRun: boolean): void {
  let result;
  try {
    result = reconcileServiceRegistry({
      registryRaw: config.serviceRegistry,
      publicKeyDir: config.servicePublicKeyDir,
      store: deps.serviceKeyStore,
    });
  } catch (e) {
    // Never fatal: an unreconciled registry degrades to "SSO for a new service is not
    // set up yet", whereas exiting here would take down login for everyone already working.
    logger.error(`[auth-server] Service registry reconcile threw`, { error: (e as Error).message });
    return;
  }

  if (!result.ran) {
    // Only on the first pass — otherwise a deliberately-unset registry logs forever.
    if (firstRun) logger.warn(`[auth-server] Service registry not reconciled: ${result.skippedReason}`);
    return;
  }

  for (const warning of result.warnings) {
    if (firstRun) logger.warn(`[auth-server] ${warning}`);
  }
  for (const action of result.actions) {
    // Every action is a credential change, so each one is logged individually rather
    // than summarised — this is the audit trail for "why did that service stop working".
    logger.info(`[auth-server] Service registry: ${action.kind} for ${JSON.stringify(action.serviceName)} (${action.detail})`);
  }
  if (firstRun && result.actions.length === 0) {
    logger.info(`[auth-server] Service registry already converged; nothing to change`);
  }
}

runServiceRegistryReconcile(true);
setInterval(() => runServiceRegistryReconcile(false), RECONCILE_INTERVAL_MS).unref();

const app = express();
registerRoutes(app, deps);

app.listen(config.port, () => {
  logger.info(`[auth-server] Listening on port ${config.port}`);
});
