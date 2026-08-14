import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

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

// A missing .env is not fatal — every knob in this service has a working default (mirrors
// scrum-poker-server's degrade-with-a-warning boot).
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  log.warn('[soulsteel-server] No .env file found; using defaults', { baseEnvFile });
}

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[soulsteel-server] Loaded environment overrides', { envFile });
}

// Port convention: game 30080/31000, web 40080/41000, KT 50080/51000, mud-builder 60080/61000,
// auth 62080/62000, scrum-poker 63080/63000 -> soulsteel 64080/64000.
process.env.PORT ??= '64000';
const config = getConfigFromEnv('soulsteel-server');

// Phase 1 (see .ai-plans/20260813-1911-soulsteel-herald-tool-mvp.md): deliberately a
// health-check-only skeleton. The Herald is the sole operator of a room — there is no
// multiplayer session to broker — and game state lives entirely in the browser's IndexedDB, so
// there are no domain routes here yet. Auth-linked archive routes are added by the follow-on
// plan (.ai-plans/20260813-1912-soulsteel-auth-archive-dashboard.md), which only needs to add
// routes to this file, not rebuild the boot/deploy scaffold.
const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    res.json({ message: 'Hello from soulsteel-server' });
  });
  app.get('/health', (_req, res) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });
});

service
  .start()
  .then(() => {
    log.info('[soulsteel-server] Listening on port', { port: config.port });

    const shutdown = (signal: string) => {
      log.info('[soulsteel-server] Shutting down', { signal });
      void service.stop().finally(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    log.error('[soulsteel-server] Failed to start', { err });
    process.exit(1);
  });
