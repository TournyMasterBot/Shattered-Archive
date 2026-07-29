import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

import { getScrumPokerConfig } from './config.js';
import { RoomStore } from './room-store.js';
import { registerScrumApiRoutes } from './http/scrum-api-routes.js';
import { setupScrumWebSocketGateway } from './ws/scrum-gateway.js';

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

// A missing .env is not fatal — every knob in config.ts has a working default, and this
// service has no required secrets (mirrors mud-builder-server's degrade-with-a-warning boot).
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) {
  dotenv.config({ path: baseEnvFile, override: true });
} else {
  log.warn('[scrum-poker-server] No .env file found; using defaults', { baseEnvFile });
}

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[scrum-poker-server] Loaded environment overrides', { envFile });
}

// Port convention: game 30080/31000, web 40080/41000, KT 50080/51000,
// mud-builder 60080/61000, auth 62080/62000 → scrum-poker 63080/63000.
process.env.PORT ??= '63000';
const config = getConfigFromEnv('scrum-poker-server');
const scrumConfig = getScrumPokerConfig();

const store = new RoomStore(scrumConfig, (message, meta) => log.warn(`[scrum-poker-server] ${message}`, meta));
const now = () => Date.now();

const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    res.json({ message: 'Hello from scrum-poker-server' });
  });
  app.get('/health', (_req, res) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });
  registerScrumApiRoutes(app, { store, now });
});

service
  .start()
  .then((httpServer) => {
    log.info('[scrum-poker-server] Listening on port', { port: config.port });
    const gateway = setupScrumWebSocketGateway(httpServer, {
      store,
      config: scrumConfig,
      now,
      onError: (err) => log.error('[scrum-poker-server] /ws/scrum error', { err }),
    });
    log.info('[scrum-poker-server] WebSocket gateway mounted at /ws/scrum', {
      dataDir: scrumConfig.dataDir,
      rooms: store.size,
      idleTimeoutMinutes: Math.round(scrumConfig.idleTimeoutMs / 60_000),
    });

    // The room file is written on a debounce, so a container recreate must get one last
    // synchronous flush or it loses whatever happened in the final second.
    const shutdown = (signal: string) => {
      log.info('[scrum-poker-server] Shutting down; flushing rooms', { signal });
      gateway.stop();
      store.flush();
      void service.stop().finally(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    log.error('[scrum-poker-server] Failed to start', { err });
    process.exit(1);
  });
