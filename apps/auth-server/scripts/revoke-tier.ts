import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { getAuthServerConfig } from '../src/config.js';
import { loadDataKey } from '../src/crypto-primitives.js';
import { AccountStore } from '../src/account-store.js';
import { AuthError } from '../src/errors.js';

/**
 * Host-run only (Phase A) — clears an account back to the plain 'user' tier.
 * Companion to grant-tier.ts.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server revoke-tier <username>
 */
async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: revoke-tier <username>');
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const store = new AccountStore(config.dataDir, loadDataKey());

  const account = store.findByUsername(username);
  if (!account) {
    console.error(`no account with username ${JSON.stringify(username)}`);
    process.exit(1);
  }

  store.setGlobalRole(account.id, 'user');
  console.log(`${account.username} (${account.id}) is back to global tier: user`);
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`revoke-tier failed: ${message}`);
  process.exit(1);
});
