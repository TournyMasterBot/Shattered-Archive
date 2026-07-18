#!/usr/bin/env node
/*
 * generate-master-key — rotate the MUD Builder master key (Phase 12b).
 *
 * Rewrites <auth-dir>/builder-auth.json with a new master key and an EMPTY
 * child-key list: every API key must be reprovisioned after a rotation. The
 * running builder server picks the change up without a restart (the auth
 * store re-reads the file when its mtime changes).
 *
 * Usage:
 *   pnpm generate-master-key                       # random key, auth dir from MERC_MUD_PATH
 *   pnpm generate-master-key -- --key <value>      # designate the key yourself
 *   pnpm generate-master-key -- --auth-dir <dir>   # explicit auth dir (tests / non-default installs)
 *
 * Pure Node on purpose: `bash` is not a given on Windows hosts (a WSL relay
 * stub without a distro fails execvpe), while node always exists here.
 * The new key is printed ONCE to stdout and never written anywhere tracked.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

let key = '';
let authDir = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--key':
      if (i + 1 >= args.length) fail('--key needs a value');
      key = args[++i];
      break;
    case '--auth-dir':
      if (i + 1 >= args.length) fail('--auth-dir needs a value');
      authDir = args[++i];
      break;
    case '-h':
    case '--help':
      console.log(
        'Usage: pnpm generate-master-key [-- --key <value>] [-- --auth-dir <dir>]\n' +
          'Rotates the MUD Builder master key and revokes ALL child API keys.\n' +
          'Default auth dir: $MERC_MUD_PATH/$MERC_AREA_DIR/auth (C:/Projects/merc-mud/2.4/area/auth).',
      );
      process.exit(0);
      break;
    default:
      fail(`unknown argument '${args[i]}' (use --key / --auth-dir)`);
  }
}

if (!authDir) {
  const mercMudPath = process.env.MERC_MUD_PATH || 'C:/Projects/merc-mud';
  const mercAreaDir = process.env.MERC_AREA_DIR || '2.4/area';
  authDir = path.join(mercMudPath, mercAreaDir, 'auth');
}

if (!key) {
  // 32 random bytes, base64url, no padding — matches the server's newToken().
  key = crypto.randomBytes(32).toString('base64url');
}

if (!/^[A-Za-z0-9_-]+$/.test(key)) {
  fail('key must be URL-safe (A-Z a-z 0-9 _ -) so it survives Bearer headers');
}

fs.mkdirSync(authDir, { recursive: true });
const file = path.join(authDir, 'builder-auth.json');
const tmp = `${file}.tmp`;
fs.writeFileSync(tmp, `${JSON.stringify({ masterKey: key, keys: [] }, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tmp, file);

console.log(`Master key rotated at ${file}`);
console.log('ALL child API keys were revoked and must be reprovisioned via the Access tab.');
console.log('');
console.log('New master key (shown once, store it safely):');
console.log(key);
