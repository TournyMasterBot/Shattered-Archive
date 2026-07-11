import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { LogLevel, type ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, Logger } from '@shatteredarchive/services-server';

import { setupKtWebSocketGateway } from './ws/kt-gateway.js';

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

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(baseEnvFile)) {
  throw new Error(`Fatal exception : Could not find base environment file at ${baseEnvFile}`);
}
dotenv.config({ path: baseEnvFile, override: true });

const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
  log.debug('[kingdom-tactics-server] Loaded environment overrides', { envFile });
} else {
  log.warn('[kingdom-tactics-server] No environment override file found', { envFile });
}

const config = getConfigFromEnv('kingdom-tactics-server');

const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    res.json({ message: 'Hello from kingdom-tactics-server' });
  });
  app.get('/health', (_req, res) => {
    const health: ServerHealth = { status: 'ok', uptimeSeconds: process.uptime() };
    res.json(health);
  });
});

service
  .start()
  .then((httpServer) => {
    log.info('[kingdom-tactics-server] Listening on port', { port: config.port });
    setupKtWebSocketGateway(httpServer, {
      onError: (err) => log.error('[kingdom-tactics-server] /ws/kt error', { err }),
    });
    log.info('[kingdom-tactics-server] WebSocket gateway mounted at /ws/kt');
  })
  .catch((err) => {
    log.error('[kingdom-tactics-server] Failed to start', { err });
    process.exit(1);
  });
