import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const baseEnvFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(baseEnvFile)) dotenv.config({ path: baseEnvFile, override: true });

import { getAuthServerConfig } from '../src/config.js';
import { loadDataKey } from '../src/crypto-primitives.js';
import { AccountStore, generateOneTimePassword } from '../src/account-store.js';
import { AuthError } from '../src/errors.js';

/**
 * Host-run only — never an HTTP route. Mints a fresh, cryptographically
 * random temporary password for an EXISTING account and forces a password
 * change on next login. The plaintext password is printed to the console
 * EXACTLY ONCE and never written to any log file.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server temp-password <username>
 */
async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: temp-password -- <username>');
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const key = loadDataKey();
  const store = new AccountStore(config.dataDir, key);

  const account = store.findByUsername(username);
  if (!account) {
    console.error(`no account with username ${JSON.stringify(username)}`);
    process.exit(1);
  }

  const password = generateOneTimePassword();
  await store.adminSetTemporaryPassword(account.id, password);

  // shown exactly once, by design; never logged to a file
  console.log(
    [
      `Temporary password issued for ${JSON.stringify(account.username)}:`,
      '',
      `  ${password}`,
      '',
      'Write this down now — it is shown only once and only a hash is stored.',
      'The account must change this password on next login before anything else is usable.',
      'Every previously issued API key and session for this account is now invalid.',
    ].join('\n'),
  );
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`temp-password failed: ${message}`);
  process.exit(1);
});
