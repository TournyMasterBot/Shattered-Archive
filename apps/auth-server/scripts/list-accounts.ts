import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { loadDataKey } from '../src/crypto-primitives.js';
import { AccountStore } from '../src/account-store.js';

/**
 * Host-run only, READ-ONLY. Lists the accounts in one encrypted store directory so two stores can be compared
 * (e.g. the old `data/` against the `data/prod-secure/` the server reads since SECURE_DATA_DIR was set).
 * Prints username, created date, tier and flags only: never an id, hash, salt, email or token.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server list-accounts <directory containing auth-accounts.json>
 */
function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: list-accounts <directory containing auth-accounts.json>');
    process.exit(1);
  }
  const resolved = path.resolve(dir);
  // AccountStore creates an empty store when the file is missing; this tool must never write.
  if (!fs.existsSync(path.join(resolved, 'auth-accounts.json'))) {
    console.error(`no auth-accounts.json in ${resolved}`);
    process.exit(1);
  }

  const accounts = new AccountStore(resolved, loadDataKey()).listAll();
  console.log(`${accounts.length} account(s) in ${resolved}`);
  for (const a of accounts) {
    console.log(
      [
        a.createdAt,
        JSON.stringify(a.username),
        `tier=${a.globalRole ?? 'user'}`,
        a.mustChangePassword ? 'must-change-password' : '',
        a.email ? 'email-on-file' : '',
      ]
        .filter(Boolean)
        .join('  '),
    );
  }
}

try {
  main();
} catch (e) {
  console.error(`list-accounts failed: ${(e as Error).message}`);
  process.exit(1);
}
