import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { getAuthServerConfig } from '../src/config.js';
import { loadDataKey } from '../src/crypto-primitives.js';
import { ServiceKeyStore } from '../src/service-key-store.js';
import { AuthError } from '../src/errors.js';

/**
 * Host-run only. Second half of a no-downtime rotation: register a new key,
 * roll it out to the consuming service (Phase 2), confirm it's live, THEN
 * revoke the old one with this script.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server revoke-service-key <serviceName> <keyId>
 */
async function main(): Promise<void> {
  const serviceName = process.argv[2];
  const keyId = process.argv[3];
  if (!serviceName || !keyId) {
    console.error('usage: revoke-service-key -- <serviceName> <keyId>');
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const key = loadDataKey();
  const store = new ServiceKeyStore(config.dataDir, key);

  store.revokeKey(serviceName, keyId);
  console.log(`Revoked key ${keyId} for service ${JSON.stringify(serviceName)}.`);
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`revoke-service-key failed: ${message}`);
  process.exit(1);
});
