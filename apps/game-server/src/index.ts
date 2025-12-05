import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import type { ServerHealth } from '@shatteredarchive/types-server';
import { getConfigFromEnv, createExpressService, MudClientApp } from '@shatteredarchive/services-server';

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
  console.log(`[game-server] Loaded environment overrides from ${envFile}`);
} else {
  console.warn(`[game-server] No environment override file found at ${envFile}, using base .env only`);
}

const config = getConfigFromEnv('game-server');

const service = createExpressService(config, (app) => {
  app.get('/', (_req, res) => {
    console.log('Accessed /');
    res.json({ message: 'Hello from game-server' });
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
    console.log(`[game-server] Listening on port ${config.port}`);
    const app = new MudClientApp({
      host: 'dsl-mud.org',
      port: 4000,
    });
  })
  .catch((err) => {
    console.error(`[game-server] Failed to start`, err);
    process.exit(1);
  });
