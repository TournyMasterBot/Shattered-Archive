import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { getAuthServerConfig } from '../src/config.js';
import { loadDataKey, generateServiceKeypair } from '../src/crypto-primitives.js';
import { ServiceKeyStore } from '../src/service-key-store.js';
import { AuthError } from '../src/errors.js';

/**
 * Host-run only. Generates a fresh Ed25519 keypair for a consuming service,
 * registers the PUBLIC half here, and prints the PRIVATE half to console
 * EXACTLY ONCE. The private key is never stored by auth-server.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server register-service <serviceName>
 */
async function main(): Promise<void> {
  const serviceName = process.argv[2];
  if (!serviceName) {
    console.error('usage: register-service -- <serviceName>');
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const key = loadDataKey();
  const store = new ServiceKeyStore(config.dataDir, key);

  const { publicKeyPem, privateKeyPem } = generateServiceKeypair();
  const { keyId } = store.registerKey(serviceName, publicKeyPem);

  // shown exactly once, by design; never logged to a file
  console.log(
    [
      `Registered a new Ed25519 key (id: ${keyId}) for service ${JSON.stringify(serviceName)}.`,
      '',
      'PRIVATE KEY — save this to shattered-service.key on the CONSUMING service\'s host.',
      'Never commit it. Never re-print it. auth-server does not store this half.',
      '',
      privateKeyPem,
    ].join('\n'),
  );
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`register-service failed: ${message}`);
  process.exit(1);
});
