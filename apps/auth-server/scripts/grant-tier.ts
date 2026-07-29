import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { getAuthServerConfig } from '../src/config.js';
import { loadDataKey } from '../src/crypto-primitives.js';
import { AccountStore } from '../src/account-store.js';
import { GLOBAL_TIERS } from '../src/global-tiers.js';
import { AuthError } from '../src/errors.js';

/**
 * Host-run only (Phase A) — assigns a hub-global tier to an account. The
 * strictly-below-managed HTTP admin surface arrives in Phase A2; until then
 * tier changes happen here, on the host, against the live data dir.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server grant-tier <username> <tier>
 */
async function main(): Promise<void> {
  const [username, tier] = process.argv.slice(2);
  if (!username || !tier) {
    console.error(`usage: grant-tier <username> <${GLOBAL_TIERS.join('|')}>`);
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const store = new AccountStore(config.dataDir, loadDataKey());

  const account = store.findByUsername(username);
  if (!account) {
    console.error(`no account with username ${JSON.stringify(username)}`);
    process.exit(1);
  }

  store.setGlobalRole(account.id, tier);
  const now = store.require(account.id).globalRole ?? 'user';
  console.log(`${account.username} (${account.id}) now has global tier: ${now}`);
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`grant-tier failed: ${message}`);
  process.exit(1);
});
