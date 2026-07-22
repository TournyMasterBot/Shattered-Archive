import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { introspect } from '@shatteredarchive/services-server';

const SERVICE_NAME = 'kingdom-tactics-server';

/**
 * Host-run only. Proves the Ed25519 /api/introspect mechanism works against a real,
 * running auth-server for this service's registered key — NOT an HTTP route (this service
 * has no existing auth surface to safely hang one off; see the Phase 3 plan's Constraints
 * for why a host-only script was chosen instead of inventing a new guard).
 *
 * Usage: pnpm --filter @shatteredarchive/kingdom-tactics-server introspect-check <token>
 */
async function main(): Promise<void> {
  const token = process.argv[2];
  if (!token) {
    console.error('usage: introspect-check <token>');
    process.exit(1);
  }

  const authServerUrl = process.env.AUTH_SERVER_URL;
  const keyPath = process.env.SERVICE_PRIVATE_KEY_PATH;
  if (!authServerUrl || !keyPath) {
    console.error('introspect-check requires AUTH_SERVER_URL and SERVICE_PRIVATE_KEY_PATH to be set');
    process.exit(1);
  }

  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const result = await introspect(authServerUrl, SERVICE_NAME, privateKeyPem, token);
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error(`introspect-check failed: ${(e as Error).message}`);
  process.exit(1);
});
