#!/usr/bin/env node
/**
 * Guard: Copilot and Simulacrum Admin are local-only. No production file or artifact may carry any trace of either
 * (edge cases LOCAL-01, LOCAL-02, LOCAL-04; docs/standards/edge-cases/local-only-features.md). Each feature has its own name pattern,
 * allowed Dockerfile lines and bundle marker (the FEATURES list below), so a new local-only feature is one more entry, not a new script.
 *
 * Checks
 *  1. Production compose files (every deploy/docker-compose*.yml except the experimental one) name no local-only feature.
 *  2. Production Dockerfiles (every deploy/*.Dockerfile except copilot-server.Dockerfile) name none, except the lines each
 *     feature lists in FEATURES (Copilot: manifest COPY lines and its two build switches; Simulacrum Admin: its one build switch).
 *  3. Every nginx file under deploy/nginx except the edge-copilot*.conf and edge-simulacrum-admin*.conf files names none. The shared
 *     edge-subdomains.conf is mounted by BOTH compose files, so each feature's vhost lives in its own template.
 *  4. Any built production dist given with --dist (default apps/game-client/dist when it exists) does not contain a feature's bundle
 *     marker (COPILOT_BUNDLE_MARKER from services/copilot-core/src/contracts.ts, SIMULACRUM_ADMIN_BUNDLE_MARKER from
 *     apps/game-client/src/features/simulacrumAdmin/marker.ts) or the Simulacrum Admin vhost name.
 *
 * Usage: node scripts/check-local-only.mjs [--root <repo>] [--dist <dir>]...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LOCAL_COMPOSE_FILES = ['docker-compose.shattered-archive-experimental.yml'];
export const LOCAL_DOCKERFILES = ['copilot-server.Dockerfile'];
/** nginx files that only the experimental compose mounts: each local-only feature's vhost template and CSP override. */
export const LOCAL_NGINX_FILE = /^edge-(copilot|simulacrum-admin)[\w-]*\.conf$/;

/** Comments explaining a switch are allowed in a shared Dockerfile. */
const DOCKERFILE_COMMENT = /^\s*#/;

/**
 * The local-only features. `pattern` finds a feature's name in a production file; `allowedDockerfileLines` are the only lines a shared
 * production Dockerfile may carry about it; `markerFile` and `markerConst` say where its bundle marker is defined; `distNeedles` are
 * further strings that must not be in a production dist. Edge case LOCAL-04: a feature that is not in this list is not guarded.
 */
export const FEATURES = [
  {
    name: 'Copilot',
    pattern: /copilot/i,
    allowedDockerfileLines: [
      // workspace manifests (frozen installs need every project's package.json, see check-workspace-manifests.mjs)
      /^\s*COPY\s+(apps|services)\/copilot-[\w-]+\/package\.json\s+\S+\s*$/,
      // the game-client image's build switches; unset in every production build
      /^\s*(ARG|ENV)\s+COPILOT_LOCAL(=\$COPILOT_LOCAL)?\s*$/,
      /^\s*(ARG|ENV)\s+VITE_COPILOT_API(=\$VITE_COPILOT_API)?\s*$/,
      DOCKERFILE_COMMENT,
    ],
    markerFile: 'services/copilot-core/src/contracts.ts',
    markerConst: 'COPILOT_BUNDLE_MARKER',
    distNeedles: [],
  },
  {
    name: 'Simulacrum Admin',
    pattern: /simulacrum[-_ ]?admin/i,
    allowedDockerfileLines: [/^\s*(ARG|ENV)\s+SIMULACRUM_ADMIN_LOCAL(=\$SIMULACRUM_ADMIN_LOCAL)?\s*$/, DOCKERFILE_COMMENT],
    markerFile: 'apps/game-client/src/features/simulacrumAdmin/marker.ts',
    markerConst: 'SIMULACRUM_ADMIN_BUNDLE_MARKER',
    // the dev-only vhost name, and the route of the Simulacrum's map (a second world that exists only on the owner's machine), must not be
    // compiled into a production bundle either
    distNeedles: ['simulacrum-admin.shatteredarchive.dev', 'api/world-map/sandbox'],
  },
];

/** The bundle marker of one feature (Copilot by default), read from the file that defines it. A missing constant is an error. */
export function readMarker(root, feature = FEATURES[0]) {
  const text = fs.readFileSync(path.join(root, feature.markerFile), 'utf8');
  const m = text.match(new RegExp(`${feature.markerConst}\\s*=\\s*'([^']+)'`));
  if (!m) throw new Error(`${feature.markerConst} not found in ${feature.markerFile}`);
  return m[1];
}

/** Every string a production dist must not contain: each feature's marker and its extra needles. */
export function readAllNeedles(root) {
  return FEATURES.flatMap((feature) => [readMarker(root, feature), ...feature.distNeedles]);
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && predicate(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * A line is a problem when it names a local-only feature and is not one of the lines that feature may carry in this file.
 * `allowedFor(feature)` returns the allowed line patterns (none for compose and nginx files).
 */
function findLines(file, text, allowedFor = () => []) {
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const feature of FEATURES) {
      if (!feature.pattern.test(line)) continue;
      if (allowedFor(feature).some((re) => re.test(line))) continue;
      problems.push({ file, line: i + 1, text: line.trim().slice(0, 120), feature: feature.name });
      break; // one report per line
    }
  });
  return problems;
}

/** Checks 1-3: text files that production uses. */
export function checkSourceFiles(root) {
  const problems = [];
  const deploy = path.join(root, 'deploy');

  for (const name of listFiles(deploy, (n) => /^docker-compose.*\.ya?ml$/.test(n) && !LOCAL_COMPOSE_FILES.includes(n))) {
    problems.push(...findLines(`deploy/${name}`, fs.readFileSync(path.join(deploy, name), 'utf8')));
  }
  for (const name of listFiles(deploy, (n) => n.endsWith('.Dockerfile') && !LOCAL_DOCKERFILES.includes(n))) {
    problems.push(
      ...findLines(`deploy/${name}`, fs.readFileSync(path.join(deploy, name), 'utf8'), (feature) => feature.allowedDockerfileLines),
    );
  }
  // nginx: the top folder and includes/ (both are mounted by the production compose); certs/ holds keys, not config
  const nginxDir = path.join(deploy, 'nginx');
  for (const sub of ['', 'includes']) {
    const dir = path.join(nginxDir, sub);
    for (const name of listFiles(dir, (n) => /\.(conf|sh|template)$/.test(n) && !LOCAL_NGINX_FILE.test(n))) {
      const rel = sub === '' ? name : `${sub}/${name}`;
      problems.push(...findLines(`deploy/nginx/${rel}`, fs.readFileSync(path.join(dir, name), 'utf8')));
    }
  }
  return problems;
}

/** Check 4: a built dist must not contain a marker (one string, or a list of strings). */
export function checkDist(distDir, markers) {
  const problems = [];
  if (!fs.existsSync(distDir)) {
    return [{ file: distDir, line: 0, text: 'dist folder does not exist (build it first)' }];
  }
  const needles = (Array.isArray(markers) ? markers : [markers]).map((marker) => ({ marker, bytes: Buffer.from(marker, 'utf8') }));
  const stack = [distDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const content = fs.readFileSync(full);
      for (const { marker, bytes } of needles) {
        if (content.includes(bytes)) {
          problems.push({ file: path.relative(distDir, full).replace(/\\/g, '/'), line: 0, text: `contains marker ${marker}` });
        }
      }
    }
  }
  return problems;
}

export function runChecks({ root, dists }) {
  const needles = readAllNeedles(root);
  const problems = checkSourceFiles(root);
  for (const dist of dists) problems.push(...checkDist(dist, needles));
  return problems;
}

function parseArgs(argv) {
  const out = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dists: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = path.resolve(argv[++i]);
    else if (argv[i] === '--dist') out.dists.push(path.resolve(argv[++i]));
  }
  if (out.dists.length === 0) {
    const defaultDist = path.join(out.root, 'apps/game-client/dist');
    if (fs.existsSync(defaultDist)) out.dists.push(defaultDist);
  }
  return out;
}

function main() {
  const { root, dists } = parseArgs(process.argv.slice(2));
  const problems = runChecks({ root, dists });
  if (problems.length === 0) {
    console.log(`check-local-only: OK (source files clean, ${dists.length} dist folder(s) without the marker)`);
    return;
  }
  console.error('check-local-only: FAILED. Local-only content (Copilot or Simulacrum Admin) found where production can see it:');
  for (const p of problems) console.error(`  ${p.file}${p.line ? `:${p.line}` : ''}  ${p.text}`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
