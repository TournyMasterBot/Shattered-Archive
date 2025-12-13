import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import type { ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService } from '@shatteredarchive/services-server';

// 1) Load base .env (required)
const baseEnvFile = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(baseEnvFile)) {
  throw new Error(`Fatal exception : Could not find base environment file at ${baseEnvFile}`);
}
dotenv.config({
  path: baseEnvFile,
  override: true,
});

// 2) Load environment-specific overrides (optional)
const env = process.env.ENVIRONMENT ?? 'dev';
const envFile = path.resolve(process.cwd(), `.env.${env}`);
if (fs.existsSync(envFile)) {
  dotenv.config({
    path: envFile,
    override: true,
  });
  console.log(`[web-server] Loaded environment overrides from ${envFile}`);
} else {
  console.warn(`[web-server] No environment override file found at ${envFile}, using base .env only`);
}

const serverPort = process.env.PORT;
if (!serverPort) {
  throw new Error('Fatal exception : environment variable PORT is not defined');
}
console.log(`Loaded environment from ${envFile}`);

// Load standardized config for this service
const webConfig = getConfigFromEnv('web-server');

const service = createExpressService(webConfig, (app) => {
  app.get('/', (_req, res) => {
    console.log('Accessed /');
    res.json({ message: 'Hello from web-server' });
  });

  app.get('/health', (_req, res) => {
    console.log('Accessed /health');
    const health: ServerHealth = {
      status: 'ok',
      uptimeSeconds: process.uptime(),
    };
    res.json(health);
  });
});

service
  .start()
  .then(() => {
    console.log(`[game-server] Listening on port ${serverPort}`);
  })
  .catch((err) => {
    console.error(`[game-server] Failed to start`, err);
    process.exit(1);
  });
