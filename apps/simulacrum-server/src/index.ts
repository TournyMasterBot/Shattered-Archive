import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

import { registerRoutes } from './app.js';
import { getSimulacrumConfig } from './config.js';
import { createRelay } from './relay.js';
import { RoleStore } from './role-store.js';

const log = new Logger({
  consoleLevel: LogLevel.Debug,
  diskJsonLevel: LogLevel.Debug,
  diskJsonEnabled: true,
  diskJsonPath: process.env.JSON_LOG_FILE_PATH ?? './log/server.log.jsonl',
  level: LogLevel.Debug,
  fileLevel: LogLevel.Debug,
  filePath: process.env.LOG_FILE_PATH ?? './log/server.log',
  maxSize: process.env.LOG_MAX_FILE_SIZE ?? undefined,
  maxFiles: process.env.LOG_MAX_FILES ?? undefined,
  datePartitioned: Boolean(process.env.LOG_DATE_PARTITIONED ?? 'false'),
  diskToggleOnSoh: Boolean(process.env.LOG_RESPECT_SOH ?? 'true'),
  sohToggleEventTypes: [],
});

// A missing .env is not fatal — every knob in this service has a working default.
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  log.warn('[simulacrum-server] No .env file found; using defaults', { baseEnvFile });
}

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[simulacrum-server] Loaded environment overrides', { envFile });
}

// Port convention: game 31000, web 41000, KT 51000, mud-builder 61000, auth 62000,
// scrum-poker 63000, soulsteel 64000 -> simulacrum 65000 (Express), 65001 (TCP relay).
process.env.PORT ??= '65000';
const config = getConfigFromEnv('simulacrum-server');
// This app serves the sign-in page's own HTML/JS directly (express.static in app.ts),
// unlike every other createExpressService consumer here, which is a JSON-only API behind
// a separate static-nginx client container — so helmet's default `default-src 'none'` CSP
// (meant for JSON endpoints) would block the page's own script and fetch calls. nginx's
// security-headers.conf already sets the real browser-facing CSP for this hostname (see
// deploy/nginx/edge-subdomains.conf's simulacrum block); disabling helmet's here avoids a
// second, stricter CSP header stacking on top and silently over-restricting via the
// browser's intersection-of-policies behavior (default-src 'none' has no connect-src
// override, so it would block same-origin fetch() too, not just cross-origin).
config.helmetOptions = { contentSecurityPolicy: false };
const simulacrumConfig = getSimulacrumConfig();
const roleStore = new RoleStore(simulacrumConfig.roleStoreDataPath);

const service = createExpressService(config, (app) => registerRoutes(app, simulacrumConfig, roleStore));

const relay = createRelay({
  accessCodesPath: simulacrumConfig.accessCodesPath,
  roleStore,
  mercMudHost: simulacrumConfig.mercMudHost,
  mercMudPort: simulacrumConfig.mercMudPort,
  promptTimeoutMs: simulacrumConfig.accessCodePromptTimeoutMs,
});

Promise.all([
  service.start(),
  new Promise<void>((resolve, reject) => {
    relay.server.once('error', reject);
    relay.server.listen(simulacrumConfig.relayPort, '0.0.0.0', () => {
      relay.server.off('error', reject);
      resolve();
    });
  }),
])
  .then(() => {
    log.info('[simulacrum-server] Express listening', { port: config.port });
    log.info('[simulacrum-server] Gated relay listening', {
      port: simulacrumConfig.relayPort,
      target: `${simulacrumConfig.mercMudHost}:${simulacrumConfig.mercMudPort}`,
    });
    if (!simulacrumConfig.authServerPublicUrl || !simulacrumConfig.publicUrl) {
      log.warn('[simulacrum-server] SIMULACRUM_PUBLIC_URL / AUTH_SERVER_PUBLIC_URL not fully configured — the sign-in page cannot complete SSO');
    }

    const shutdown = (signal: string): void => {
      log.info('[simulacrum-server] Shutting down', { signal });
      relay.server.close();
      void service.stop().finally(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err: unknown) => {
    log.error('[simulacrum-server] Failed to start', { err });
    process.exit(1);
  });
