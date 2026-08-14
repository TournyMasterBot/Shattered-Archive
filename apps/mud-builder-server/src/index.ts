import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

import { registerRoutes } from './app.js';
import { getMudBuilderConfig } from './config.js';

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

// A missing .env is not fatal for this local-first tool (stability tenet:
// degrade with a warning, never die on optional configuration).
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  log.warn('[mud-builder-server] No .env file found; using defaults', { baseEnvFile });
}

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[mud-builder-server] Loaded environment overrides', { envFile });
}

process.env.PORT ??= '61000';
const config = getConfigFromEnv('mud-builder-server');
const builderConfig = getMudBuilderConfig();

const service = createExpressService(config, (app) => registerRoutes(app, builderConfig));

service
  .start()
  .then(() => {
    log.info('[mud-builder-server] Listening on port', { port: config.port });
    log.info('[mud-builder-server] Target MUD', {
      areaPath: builderConfig.areaPath,
      writeEnabled: builderConfig.writeEnabled,
    });
    if (!builderConfig.writeEnabled) {
      log.info('[mud-builder-server] Disk writes are GATED OFF (preview/download only). Set MUD_WRITE_ENABLED=true deliberately to enable.');
    }
    if (builderConfig.authEnabled) {
      log.info('[mud-builder-server] Builder auth is ON — mutations require a bearer token', {
        authFile: `${builderConfig.authDataPath}/builder-auth.json`,
      });
    } else if (builderConfig.writeEnabled) {
      log.warn('[mud-builder-server] Builder auth is OFF while writes are ENABLED (MUD_BUILDER_AUTH=off) — local testing only, never deploy like this.');
    }
  })
  .catch((err) => {
    log.error('[mud-builder-server] Failed to start', { err });
    process.exit(1);
  });
