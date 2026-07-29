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
 * Host-run only (Phase A) — manages a service's registered SSO redirect URIs
 * (exact-match, http(s) only). The service must already exist via
 * register-service; approve/exchange refuse anything not registered here.
 *
 * Usage: pnpm --filter @shatteredarchive/auth-server register-redirect-uri <service> <add|remove|list> [uri]
 */
async function main(): Promise<void> {
  const [serviceName, verb, uri] = process.argv.slice(2);
  if (!serviceName || !verb || (verb !== 'list' && !uri) || !['add', 'remove', 'list'].includes(verb)) {
    console.error('usage: register-redirect-uri <service> <add|remove|list> [uri]');
    process.exit(1);
  }

  const config = getAuthServerConfig();
  const store = new ServiceKeyStore(config.dataDir, loadDataKey());

  if (verb === 'add') {
    store.addRedirectUri(serviceName, uri);
    console.log(`added. ${JSON.stringify(serviceName)} redirect URIs are now:`);
  } else if (verb === 'remove') {
    store.removeRedirectUri(serviceName, uri);
    console.log(`removed. ${JSON.stringify(serviceName)} redirect URIs are now:`);
  } else {
    console.log(`${JSON.stringify(serviceName)} redirect URIs:`);
  }

  const uris = store.listRedirectUris(serviceName);
  console.log(uris.length ? uris.map((u) => `  - ${u}`).join('\n') : '  (none)');
}

main().catch((e) => {
  const message = e instanceof AuthError ? e.message : (e as Error).message;
  console.error(`register-redirect-uri failed: ${message}`);
  process.exit(1);
});
