import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FEATURES, checkDist, checkSourceFiles, readAllNeedles, readMarker, runChecks } from './check-local-only.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'sa-copilot-local-v1';
const ADMIN_MARKER_VALUE = 'sa-simulacrum-admin-local-v1';
const ADMIN_VHOST = 'simulacrum-admin.shatteredarchive.dev';
const SANDBOX_ROUTE = 'api/world-map/sandbox';
const scratch = [];

after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A minimal repo with clean production files and the contracts file the guard reads the marker from. */
function cleanRepo() {
  const root = tmp('local-only-');
  write(root, 'services/copilot-core/src/contracts.ts', `export const COPILOT_BUNDLE_MARKER = '${MARKER}';\n`);
  write(
    root,
    'apps/game-client/src/features/simulacrumAdmin/marker.ts',
    `export const SIMULACRUM_ADMIN_BUNDLE_MARKER = '${ADMIN_MARKER_VALUE}';\n`,
  );
  write(root, 'deploy/docker-compose.yml', 'services:\n  game-client:\n    image: x\n');
  write(root, 'deploy/docker-compose.shattered-archive-experimental.yml', 'services:\n  copilot-server:\n    image: y\n');
  write(root, 'deploy/game-client.Dockerfile', 'FROM node AS build\nRUN pnpm install\n');
  write(root, 'deploy/copilot-server.Dockerfile', 'FROM node\nCOPY apps/copilot-server ./\n');
  write(root, 'deploy/nginx/edge-subdomains.conf', 'server { server_name simulacrum.example; }\n');
  write(root, 'deploy/nginx/edge-copilot.conf', 'server { server_name copilot.example; }\n');
  return root;
}

test('the marker is read from the contracts file and equals the documented value', () => {
  assert.equal(readMarker(repoRoot), MARKER);
});

test('a missing marker constant is an error, not a silent pass', () => {
  const root = cleanRepo();
  write(root, 'services/copilot-core/src/contracts.ts', 'export const X = 1;\n');
  assert.throws(() => readMarker(root), /COPILOT_BUNDLE_MARKER not found/);
});

test('a clean fixture passes, and Copilot-only files are not scanned (L2)', () => {
  assert.deepEqual(checkSourceFiles(cleanRepo()), []);
});

test('a Copilot service in the production compose fails (L2)', () => {
  const root = cleanRepo();
  write(root, 'deploy/docker-compose.yml', 'services:\n  copilot-server:\n    image: y\n');
  const problems = checkSourceFiles(root);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].file, 'deploy/docker-compose.yml');
  assert.equal(problems[0].line, 2);
});

test('a Copilot vhost added to the shared edge-subdomains.conf fails (L2)', () => {
  const root = cleanRepo();
  write(root, 'deploy/nginx/edge-subdomains.conf', 'server { server_name copilot.example; }\n');
  assert.deepEqual(checkSourceFiles(root).map((p) => p.file), ['deploy/nginx/edge-subdomains.conf']);
});

test('shared Dockerfiles may carry the workspace manifest lines and the two build switches, nothing else (L2)', () => {
  const root = cleanRepo();
  write(
    root,
    'deploy/game-client.Dockerfile',
    [
      'FROM node AS build',
      'COPY services/copilot-core/package.json ./services/copilot-core/package.json',
      'COPY apps/copilot-server/package.json ./apps/copilot-server/package.json',
      '# Local-only Copilot switch',
      'ARG COPILOT_LOCAL',
      'ENV COPILOT_LOCAL=$COPILOT_LOCAL',
      'ARG VITE_COPILOT_API',
      'ENV VITE_COPILOT_API=$VITE_COPILOT_API',
    ].join('\n'),
  );
  assert.deepEqual(checkSourceFiles(root), []);

  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nCOPY apps/copilot-server ./apps/copilot-server\n');
  assert.equal(checkSourceFiles(root).length, 1);

  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nENV COPILOT_LOCAL=true\n');
  assert.equal(checkSourceFiles(root).length, 1, 'a hard-coded true in a shared Dockerfile is a leak');
});

test('a dist containing the marker fails, a clean dist passes, a missing dist fails', () => {
  const root = cleanRepo();
  const dirty = tmp('dist-dirty-');
  write(dirty, 'assets/chunk-abc.js', `console.log("${MARKER}")`);
  write(dirty, 'index.html', '<html></html>');
  const clean = tmp('dist-clean-');
  write(clean, 'assets/index.js', 'console.log("hello")');

  assert.deepEqual(checkDist(dirty, MARKER).map((p) => p.file), ['assets/chunk-abc.js']);
  assert.deepEqual(checkDist(clean, MARKER), []);
  assert.equal(checkDist(path.join(root, 'no-such-dist'), MARKER).length, 1);
  assert.equal(runChecks({ root, dists: [dirty] }).length, 1);
  assert.deepEqual(runChecks({ root, dists: [clean] }), []);
});

test('the real repository passes', () => {
  assert.deepEqual(checkSourceFiles(repoRoot), []);
});

// ---- L1: the flag is read from the process environment only ------------------------------------------------
// The test builds a tiny entry with the REAL apps/game-client/vite.config.ts (so the real `define` is what runs)
// and checks the marker in the output.

const FLAG_VARS = ['COPILOT_LOCAL', 'SIMULACRUM_ADMIN_LOCAL'];

/**
 * Builds a tiny entry that references BOTH build constants, each guarding a dynamic import of that feature's real marker file, with the
 * REAL vite config. `processFlags` are set in the process environment (names from FLAG_VARS); `fileFlag` writes every flag into the .env*
 * files Vite would read. Returns the dist folder.
 */
async function buildWithFlags({ processFlags = [], fileFlag = false }) {
  const viteEntry = path.join(repoRoot, 'apps/game-client/node_modules/vite/dist/node/index.js');
  const { build } = await import(pathToFileURL(viteEntry).href);
  const contracts = path.join(repoRoot, 'services/copilot-core/src/contracts.ts').replace(/\\/g, '/');
  const adminMarker = path.join(repoRoot, 'apps/game-client/src/features/simulacrumAdmin/marker.ts').replace(/\\/g, '/');

  const root = tmp('l1-fixture-');
  write(
    root,
    'main.ts',
    [
      'declare const __COPILOT_LOCAL__: boolean;',
      'declare const __SIMULACRUM_ADMIN_LOCAL__: boolean;',
      `if (__COPILOT_LOCAL__) {\n  import('${contracts}').then((m) => console.log(m.COPILOT_BUNDLE_MARKER));\n}`,
      `if (__SIMULACRUM_ADMIN_LOCAL__) {\n  import('${adminMarker}').then((m) => console.log(m.SIMULACRUM_ADMIN_BUNDLE_MARKER, '${ADMIN_VHOST}'));\n}`,
      'export {};',
      '',
    ].join('\n'),
  );
  if (fileFlag) {
    // every env file name Vite reads, in the folder it reads them from and in the process cwd while building
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
      write(root, name, `${FLAG_VARS.map((v) => `${v}=true\nVITE_${v}=true\n`).join('')}`);
    }
  }
  const outDir = path.join(root, 'dist');

  const saved = Object.fromEntries(FLAG_VARS.map((v) => [v, process.env[v]]));
  const savedCwd = process.cwd();
  const savedLog = console.log;
  for (const v of FLAG_VARS) {
    if (processFlags.includes(v)) process.env[v] = 'true';
    else delete process.env[v];
  }
  process.chdir(root);
  console.log = () => {}; // the real config prints its loaded environment
  try {
    await build({
      configFile: path.join(repoRoot, 'apps/game-client/vite.config.ts'),
      root,
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, minify: false, rollupOptions: { input: path.join(root, 'main.ts') } },
    });
  } finally {
    console.log = savedLog;
    process.chdir(savedCwd);
    for (const v of FLAG_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
  }
  return outDir;
}

const buildFixture = ({ processFlag, fileFlag }) => buildWithFlags({ processFlags: processFlag ? ['COPILOT_LOCAL'] : [], fileFlag });

test('L1: with COPILOT_LOCAL in the process environment the Copilot branch is bundled (the check can see it)', async () => {
  const dist = await buildFixture({ processFlag: true, fileFlag: false });
  assert.equal(checkDist(dist, MARKER).length > 0, true, 'the marker must appear when the flag is on, or the guard proves nothing');
});

test('L1: a flag set only in .env* files never enables Copilot, and the marker is absent', async () => {
  const dist = await buildFixture({ processFlag: false, fileFlag: true });
  assert.deepEqual(checkDist(dist, MARKER), []);
});

test('L1: with no flag anywhere the marker is absent', async () => {
  const dist = await buildFixture({ processFlag: false, fileFlag: false });
  assert.deepEqual(checkDist(dist, MARKER), []);
});

// ---- Phase 7: the dev-only deployment of copilot-server -------------------------------------------------------

test('the includes/ folder (also mounted by production) is scanned, and the Copilot nginx files are not (L2)', () => {
  const root = cleanRepo();
  write(root, 'deploy/nginx/edge-copilot-csp.conf', 'connect-src https://copilot.example;\n');
  assert.deepEqual(checkSourceFiles(root), []);
  write(root, 'deploy/nginx/includes/security-headers-scripting-dev.conf', 'connect-src https://copilot.example;\n');
  assert.deepEqual(checkSourceFiles(root).map((p) => p.file), ['deploy/nginx/includes/security-headers-scripting-dev.conf']);
});

const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

test('copilot-server exists only in the experimental compose, under the copilot profile, with no published port (L2)', () => {
  const experimental = read('deploy/docker-compose.shattered-archive-experimental.yml');
  const production = read('deploy/docker-compose.yml');

  assert.match(experimental, /^ {2}copilot-server:\n {4}profiles: \["copilot"\]/m);
  assert.match(experimental, /edge-copilot\.conf:\/etc\/nginx\/templates\/copilot\.conf\.template:ro/);
  assert.match(experimental, /edge-copilot-csp\.conf:\/etc\/nginx\/includes\/security-headers-scripting-dev\.conf:ro/);
  assert.match(experimental, /- copilot\.shatteredarchive\.dev/);
  assert.match(experimental, /COPILOT_LOCAL: "true"/);

  // the service block publishes nothing: no `ports:` between its header and the next service
  const block = experimental.slice(experimental.indexOf('\n  copilot-server:'), experimental.indexOf('\n  auth-server:'));
  assert.ok(block.length > 200);
  assert.doesNotMatch(block, /^ {4}ports:/m);
  assert.match(block, /^ {4}expose:\n {6}- "65100"/m);
  assert.match(block, /GameLogs\/ShatteredArchive\/Docker\/game-server:\/logs:ro/, 'the game logs are mounted read-only');

  for (const forbidden of [/copilot/i, /edge-copilot/, /65100/]) assert.doesNotMatch(production, forbidden);
});

test('the shared edge-subdomains.conf and tls files never mention the Copilot vhost or its template (L2)', () => {
  for (const file of ['deploy/nginx/edge-subdomains.conf', 'deploy/nginx/includes/tls-dev.conf', 'deploy/nginx/includes/tls-off.conf']) {
    assert.doesNotMatch(read(file), /copilot/i, file);
  }
});

test('the Copilot vhost proxies copilot.shatteredarchive.dev to copilot-server on the valid port 65100 (port 66000 does not exist)', () => {
  const conf = read('deploy/nginx/edge-copilot.conf');
  assert.equal((conf.match(/server_name copilot\.shatteredarchive\.dev;/g) ?? []).length, 2, 'one :80 and one :443 block');
  assert.match(conf, /set \$copilot_server copilot-server:65100;/);
  assert.match(conf, /deny all;/);
  assert.match(conf, /client_max_body_size 64k;/);
  assert.doesNotMatch(conf, /66000/);
  assert.match(read('apps/copilot-server/src/config.ts'), /DEFAULT_PORT = 65100/);
  assert.match(read('deploy/copilot-server.Dockerfile'), /EXPOSE 65100/);
});

test('the CSP override equals the shared dev CSP except for the two local-only connect-src origins (it cannot drift)', () => {
  const shared = read('deploy/nginx/includes/security-headers-scripting-dev.conf');
  const override = read('deploy/nginx/edge-copilot-csp.conf');
  const policyOf = (text) => text.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1];

  assert.ok(policyOf(shared) && policyOf(override));
  assert.equal(
    policyOf(override).replace(' https://copilot.shatteredarchive.dev', '').replace(' https://simulacrum-admin.shatteredarchive.dev', ''),
    policyOf(shared),
  );
  assert.match(policyOf(override), /connect-src [^;]*https:\/\/copilot\.shatteredarchive\.dev/);
  assert.match(policyOf(override), /connect-src [^;]*https:\/\/simulacrum-admin\.shatteredarchive\.dev/);
  // the shared file, which production also mounts, names neither
  assert.doesNotMatch(shared, /copilot\.shatteredarchive|simulacrum-admin/);
  // and it includes the same common headers file
  assert.match(shared, /include \/etc\/nginx\/includes\/security-headers-common\.conf;/);
  assert.match(override, /include \/etc\/nginx\/includes\/security-headers-common\.conf;/);
});

test('the Copilot Dockerfile is not referenced by any production file', () => {
  for (const file of ['deploy/docker-compose.yml', 'deploy/nginx.Dockerfile']) {
    assert.doesNotMatch(read(file), /copilot-server/, file);
  }
});

// ---- Simulacrum Admin: a SECOND local-only feature, guarded on its own (LOCAL-04) ---------------------------------

test('LOCAL-04: both features are in the guard, each with its own marker file and constant', () => {
  assert.deepEqual(FEATURES.map((f) => f.name), ['Copilot', 'Simulacrum Admin']);
  assert.equal(readMarker(repoRoot, FEATURES[1]), ADMIN_MARKER_VALUE);
  assert.deepEqual(readAllNeedles(repoRoot), [MARKER, ADMIN_MARKER_VALUE, ADMIN_VHOST, SANDBOX_ROUTE]);
});

test('LOCAL-04: a missing Simulacrum Admin marker constant is an error, not a silent pass', () => {
  const root = cleanRepo();
  write(root, 'apps/game-client/src/features/simulacrumAdmin/marker.ts', 'export const X = 1;\n');
  assert.throws(() => readMarker(root, FEATURES[1]), /SIMULACRUM_ADMIN_BUNDLE_MARKER not found/);
  assert.throws(() => runChecks({ root, dists: [] }), /SIMULACRUM_ADMIN_BUNDLE_MARKER not found/);
});

test('LOCAL-04: a Simulacrum Admin trace in a production compose or a shared nginx file fails, and its own nginx files are not scanned', () => {
  const root = cleanRepo();
  write(root, 'deploy/nginx/edge-simulacrum-admin.conf', `server { server_name ${ADMIN_VHOST}; }\n`);
  write(root, 'deploy/nginx/edge-copilot-csp.conf', `connect-src https://${ADMIN_VHOST};\n`);
  assert.deepEqual(checkSourceFiles(root), [], 'the local-only templates may name the feature');

  write(root, 'deploy/docker-compose.yml', 'services:\n  game-client:\n    environment:\n      SIMULACRUM_ADMIN_LOCAL: "true"\n');
  const compose = checkSourceFiles(root);
  assert.equal(compose.length, 1);
  assert.deepEqual([compose[0].file, compose[0].line, compose[0].feature], ['deploy/docker-compose.yml', 4, 'Simulacrum Admin']);

  write(root, 'deploy/docker-compose.yml', 'services:\n  game-client:\n    image: x\n');
  write(root, 'deploy/nginx/edge-subdomains.conf', `server { server_name ${ADMIN_VHOST}; }\n`);
  assert.deepEqual(checkSourceFiles(root).map((p) => p.file), ['deploy/nginx/edge-subdomains.conf']);
  write(root, 'deploy/nginx/includes/security-headers-scripting-dev.conf', 'connect-src https://simulacrum_admin.example;\n');
  assert.equal(checkSourceFiles(root).length, 2, 'the includes/ folder is scanned too');
});

test('LOCAL-04: a shared Dockerfile may carry the one Simulacrum Admin build switch and comments, nothing else', () => {
  const root = cleanRepo();
  write(
    root,
    'deploy/game-client.Dockerfile',
    ['FROM node AS build', '# Local-only Simulacrum Admin switch', 'ARG SIMULACRUM_ADMIN_LOCAL', 'ENV SIMULACRUM_ADMIN_LOCAL=$SIMULACRUM_ADMIN_LOCAL'].join('\n'),
  );
  assert.deepEqual(checkSourceFiles(root), []);

  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nENV SIMULACRUM_ADMIN_LOCAL=true\n');
  assert.equal(checkSourceFiles(root).length, 1, 'a hard-coded true in a shared Dockerfile is a leak');

  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nCOPY features/simulacrumAdmin ./x\n');
  assert.equal(checkSourceFiles(root).length, 1, 'the camelCase folder name is caught as well');

  // the Copilot switch is not an allowance for the other feature, and the reverse
  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nARG COPILOT_LOCAL\nARG SIMULACRUM_ADMIN_LOCAL\n');
  assert.deepEqual(checkSourceFiles(root), []);
  write(root, 'deploy/game-client.Dockerfile', 'FROM node\nARG COPILOT_ADMIN_LOCAL\n');
  assert.equal(checkSourceFiles(root).length, 1);
});

test('LOCAL-04: a dist carrying either marker, or the vhost name, fails; a clean dist passes', () => {
  const root = cleanRepo();
  const clean = tmp('dist-clean-');
  write(clean, 'assets/index.js', 'console.log("hello")');
  assert.deepEqual(runChecks({ root, dists: [clean] }), []);

  for (const [label, text, expected] of [
    ['the Simulacrum Admin marker', `console.log("${ADMIN_MARKER_VALUE}")`, `contains marker ${ADMIN_MARKER_VALUE}`],
    ['the vhost name', `fetch("https://${ADMIN_VHOST}/api/map")`, `contains marker ${ADMIN_VHOST}`],
    ['the route of the second world map',`fetch("/${SANDBOX_ROUTE}/index")`, `contains marker ${SANDBOX_ROUTE}`],
    ['the Copilot marker', `console.log("${MARKER}")`, `contains marker ${MARKER}`],
  ]) {
    const dirty = tmp('dist-dirty-');
    write(dirty, 'assets/chunk.js', text);
    const problems = runChecks({ root, dists: [dirty] });
    assert.deepEqual(problems.map((p) => p.text), [expected], label);
  }

  const both = tmp('dist-both-');
  write(both, 'assets/a.js', `${MARKER} ${ADMIN_MARKER_VALUE}`);
  assert.equal(runChecks({ root, dists: [both] }).length, 2, 'one report per needle');
});

test('LOCAL-04: the real repository names Simulacrum Admin only in the allowed places', () => {
  assert.deepEqual(checkSourceFiles(repoRoot), []);
  const experimental = read('deploy/docker-compose.shattered-archive-experimental.yml');
  assert.match(experimental, /SIMULACRUM_ADMIN_LOCAL: "true"/);
  assert.doesNotMatch(read('deploy/docker-compose.yml'), /simulacrum[-_ ]?admin/i);
  assert.match(read('deploy/game-client.Dockerfile'), /^ARG SIMULACRUM_ADMIN_LOCAL$/m);
  assert.match(read('deploy/game-client.Dockerfile'), /^ENV SIMULACRUM_ADMIN_LOCAL=\$SIMULACRUM_ADMIN_LOCAL$/m);
});

// ---- LOCAL-01 and E15 for the second switch: real builds with each flag alone, both, and none ----------------

test('LOCAL-01: with SIMULACRUM_ADMIN_LOCAL in the process environment only its marker is bundled, and the guard can see it', async () => {
  const dist = await buildWithFlags({ processFlags: ['SIMULACRUM_ADMIN_LOCAL'] });
  assert.deepEqual(
    checkDist(dist, [MARKER, ADMIN_MARKER_VALUE]).map((p) => p.text),
    [`contains marker ${ADMIN_MARKER_VALUE}`],
    'the marker must appear when the flag is on, or the guard proves nothing; the Copilot marker must not',
  );
  assert.equal(checkDist(dist, ADMIN_VHOST).length, 1);
});

test('LOCAL-01: a Simulacrum Admin flag set only in .env* files never enables it', async () => {
  const dist = await buildWithFlags({ fileFlag: true });
  assert.deepEqual(checkDist(dist, [MARKER, ADMIN_MARKER_VALUE, ADMIN_VHOST, SANDBOX_ROUTE]), []);
});

test('E15: the Copilot flag alone bundles only the Copilot marker; both flags bundle both; no flag bundles neither', async () => {
  const copilotOnly = await buildWithFlags({ processFlags: ['COPILOT_LOCAL'] });
  assert.deepEqual(checkDist(copilotOnly, [MARKER, ADMIN_MARKER_VALUE, ADMIN_VHOST, SANDBOX_ROUTE]).map((p) => p.text), [`contains marker ${MARKER}`]);

  const both = await buildWithFlags({ processFlags: ['COPILOT_LOCAL', 'SIMULACRUM_ADMIN_LOCAL'] });
  const found = checkDist(both, [MARKER, ADMIN_MARKER_VALUE]).map((p) => p.text).sort();
  assert.deepEqual(found, [`contains marker ${ADMIN_MARKER_VALUE}`, `contains marker ${MARKER}`].sort());

  const none = await buildWithFlags({});
  assert.deepEqual(checkDist(none, [MARKER, ADMIN_MARKER_VALUE, ADMIN_VHOST, SANDBOX_ROUTE]), []);
});

// ---- Simulacrum Admin: the local-only read-only vhost for world data (Phase 10) ---------------------------------------

/** Splits an nginx file into its top-level blocks of a kind, brace-matched, with the text of each. */
function blocks(text, opener) {
  const out = [];
  const re = new RegExp(opener, 'g');
  let m;
  while ((m = re.exec(text))) {
    let depth = 0;
    let i = text.indexOf('{', m.index);
    const start = m.index;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) break;
    }
    out.push(text.slice(start, i + 1));
  }
  return out;
}

const vhost = () => read('deploy/nginx/edge-simulacrum-admin.conf');
const stripComments = (text) => text.replace(/^\s*#.*$/gm, '');

test('the admin vhost has exactly the three read-only routes in each of its two server blocks, and a 404 for everything else (E13)', () => {
  const conf = stripComments(vhost());
  const servers = blocks(conf, '\\nserver \\{|^server \\{');
  assert.equal(servers.length, 2, 'one :80 and one :443 block');
  assert.equal((conf.match(/server_name simulacrum-admin\.shatteredarchive\.dev;/g) ?? []).length, 2);
  for (const server of servers) {
    const locations = blocks(server, 'location [^{]*\\{').map((b) => b.match(/^location ([^{]*?)\s*\{/)[1]);
    assert.deepEqual(locations, ['= /api/areas', '= /api/map', '~ ^/api/map/[A-Za-z0-9_][A-Za-z0-9_.-]*\\.are$', '/']);
    const root = blocks(server, 'location / \\{')[0];
    assert.match(root, /return 404;/);
    assert.doesNotMatch(root, /proxy_pass/);
  }
});

test('every proxied location is GET and OPTIONS only and goes to MUD Builder on its real port 61000', () => {
  const conf = stripComments(vhost());
  const proxied = blocks(conf, 'location [^/{]*/api[^{]*\\{');
  assert.equal(proxied.length, 6);
  for (const block of proxied) {
    assert.match(block, /limit_except GET OPTIONS \{ deny all; \}/);
    assert.match(block, /set \$mud_builder mud-builder-server:61000;/);
    assert.match(block, /proxy_pass http:\/\/\$mud_builder;/);
    assert.match(block, /proxy_set_header Authorization "";/, 'no inbound credential is forwarded');
    assert.match(block, /proxy_set_header Cookie "";/);
  }
  assert.match(read('apps/mud-builder-server/src/index.ts'), /process\.env\.PORT \?\?= '61000'/);
  // no route that writes, reads the audit log, the live state, a reload, or an area download
  assert.doesNotMatch(conf, /audit|state\/live|reload|download|preview/);
});

test("the vhost's file pattern is the area store's own, so nothing outside the area folder can be asked for", () => {
  const pattern = read('apps/mud-builder-server/src/area-store.ts').match(/AREA_FILE_RE = \/(.+)\/;/)?.[1];
  assert.ok(pattern);
  assert.ok(vhost().includes(pattern.replace(/^\^/, '^/api/map/')),'the vhost location uses the same expression');
});

test('the allow list equals the Copilot vhost: loopback and private ranges, then deny all (E14)', () => {
  const rules = (text) => stripComments(text).match(/^\s*(allow|deny) [^;]+;/gm).map((l) => l.trim());
  const admin = rules(vhost());
  const copilot = rules(read('deploy/nginx/edge-copilot.conf'));
  assert.deepEqual(admin, copilot);
  assert.deepEqual(admin.slice(0, 5), ['allow 127.0.0.1;', 'allow 10.0.0.0/8;', 'allow 172.16.0.0/12;', 'allow 192.168.0.0/16;', 'deny all;']);
});

test('CORS: only the three client origins are echoed, the headers are set at server level, and MUD Builder\'s own are hidden (E12)', () => {
  const conf = stripComments(vhost());
  const map = blocks(conf, 'map \\$http_origin')[0];
  const listed = [...map.matchAll(/^\s*"([^"]+)"\s+\$http_origin;/gm)].map((m) => m[1]);
  assert.deepEqual(listed, ['https://game-client.shatteredarchive.dev', 'http://game-client.shatteredarchive.dev', 'http://localhost:30080']);
  assert.match(map, /default "";/);
  assert.doesNotMatch(conf, /Access-Control-Allow-Origin \*/);
  for (const server of blocks(conf, '^server \\{|\\nserver \\{')) {
    // the headers sit at server level, with `always`, so the 404 and 403 answers carry them
    const outsideLocations = server.replace(/location [^{]*\{[^}]*\}/g, '');
    assert.match(outsideLocations, /add_header Access-Control-Allow-Origin \$sa_admin_cors_origin always;/);
    assert.match(outsideLocations, /add_header Vary Origin always;/);
    assert.match(outsideLocations, /if \(\$request_method = OPTIONS\) \{ return 204; \}/);
  }
  // an add_header inside a location would switch off every inherited header
  for (const location of blocks(conf, 'location [^{]*\\{')) assert.doesNotMatch(location, /add_header/);
  // the upstream's own CORS headers would make a second Access-Control-Allow-Origin
  for (const block of blocks(conf, 'location [^/{]*/api[^{]*\\{')) {
    for (const header of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials', 'Vary']) {
      assert.match(block, new RegExp(`proxy_hide_header ${header};`));
    }
  }
});

test('the two server blocks differ only in the listener, the certificate and the forwarded scheme', () => {
  const normalise = (block) =>
    block
      .replace(/listen [^;]+;\n/, '')
      .replace(/\n\s*ssl_certificate[^\n]*/g, '')
      .replace(/X-Forwarded-Proto https?/g, 'X-Forwarded-Proto X')
      .replace(/\s+/g, ' ');
  const [http, https] = blocks(stripComments(vhost()), '^server \\{|\\nserver \\{');
  assert.equal(normalise(http), normalise(https));
});

test('E11: the vhost name appears in no production file, and in the experimental compose only as its template and its alias', () => {
  const name = 'simulacrum-admin.shatteredarchive.dev';
  for (const file of [
    'deploy/docker-compose.yml',
    'deploy/nginx/edge-subdomains.conf',
    'deploy/nginx/includes/tls-dev.conf',
    'deploy/nginx/includes/security-headers-scripting-dev.conf',
    'deploy/nginx/includes/security-headers-scripting.conf',
    'deploy/nginx.Dockerfile',
  ]) {
    assert.ok(!read(file).includes(name) && !read(file).includes('edge-simulacrum-admin'), file);
  }
  const experimental = read('deploy/docker-compose.shattered-archive-experimental.yml');
  assert.match(experimental, /\.\/nginx\/edge-simulacrum-admin\.conf:\/etc\/nginx\/templates\/simulacrum-admin\.conf\.template:ro/);
  assert.match(experimental, /^\s+- simulacrum-admin\.shatteredarchive\.dev$/m);
  assert.deepEqual(checkSourceFiles(repoRoot), [], 'the real repository passes the source guard');
});
