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

const app = express();
registerRoutes(app, deps);

app.listen(config.port, () => {
  logger.info(`[auth-server] Listening on port ${config.port}`);
});
