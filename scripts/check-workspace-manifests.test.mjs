import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findMissingManifests,
  listWorkspaceProjects,
  sourceCovers,
  stagesBeforeInstall,
} from './check-workspace-manifests.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeRepo(dockerfileBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - services/*\n\nminimumReleaseAge: 1440\n');
  for (const p of ['apps/one', 'apps/two', 'services/core']) {
    fs.mkdirSync(path.join(root, p), { recursive: true });
    fs.writeFileSync(path.join(root, p, 'package.json'), '{}');
  }
  fs.mkdirSync(path.join(root, 'deploy'));
  fs.writeFileSync(path.join(root, 'deploy', 'x.Dockerfile'), dockerfileBody);
  return root;
}

const COMPLETE = [
  'FROM node:26 AS build',
  'COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./',
  'COPY apps/one/package.json ./apps/one/package.json',
  'COPY apps/two/package.json ./apps/two/package.json',
  'COPY services/core/package.json ./services/core/package.json',
  'RUN pnpm install --frozen-lockfile',
].join('\n');

test('a Dockerfile listing every project manifest passes (L3)', () => {
  assert.deepEqual(findMissingManifests(makeRepo(COMPLETE)), []);
});

test('a Dockerfile missing one project manifest line fails and names the project (L3)', () => {
  const without = COMPLETE.replace('COPY services/core/package.json ./services/core/package.json\n', '');
  const problems = findMissingManifests(makeRepo(without));
  assert.equal(problems.length, 1);
  assert.equal(problems[0].project, 'services/core');
  assert.equal(problems[0].dockerfile, 'deploy/x.Dockerfile');
  assert.equal(problems[0].stage, 'stage build');
});

test('copying a whole ancestor folder covers every project under it', () => {
  const body = [
    'FROM node:26 AS build',
    'COPY apps ./apps',
    'COPY services/ ./services/',
    'RUN pnpm install --frozen-lockfile',
  ].join('\n');
  assert.deepEqual(findMissingManifests(makeRepo(body)), []);
});

test('a manifest copied only AFTER the install does not count', () => {
  const body = [
    'FROM node:26 AS build',
    'COPY apps/one/package.json ./apps/one/package.json',
    'COPY apps/two/package.json ./apps/two/package.json',
    'RUN pnpm install --frozen-lockfile',
    'COPY services/core/package.json ./services/core/package.json',
  ].join('\n');
  assert.deepEqual(findMissingManifests(makeRepo(body)).map((p) => p.project), ['services/core']);
});

test('a COPY --from line (another stage) does not count', () => {
  const body = COMPLETE.replace(
    'COPY services/core/package.json ./services/core/package.json',
    'COPY --from=build /repo/services/core/package.json ./services/core/package.json',
  );
  assert.deepEqual(findMissingManifests(makeRepo(body)).map((p) => p.project), ['services/core']);
});

test('every stage with an install is checked on its own (build ok, runtime missing)', () => {
  const body = `${COMPLETE}\nFROM node:26 AS runtime\nCOPY apps/one/package.json ./apps/one/package.json\nRUN pnpm install --frozen-lockfile --prod`;
  const problems = findMissingManifests(makeRepo(body));
  assert.deepEqual(
    problems.map((p) => `${p.stage}:${p.project}`).sort(),
    ['stage runtime:apps/two', 'stage runtime:services/core'],
  );
});

test('a Dockerfile with no pnpm install (nginx) is not checked', () => {
  assert.deepEqual(findMissingManifests(makeRepo('FROM nginx:1\nCOPY a b')), []);
});

test('line continuations and multi-source COPY lines are understood', () => {
  const stages = stagesBeforeInstall('FROM node AS b\nCOPY a.json \\\n  b.json ./\nRUN pnpm install\n');
  assert.deepEqual(stages[0].sources, ['a.json', 'b.json']);
});

test('sourceCovers matches the manifest, the project folder, an ancestor and the root', () => {
  assert.equal(sourceCovers('apps/one/package.json', 'apps/one'), true);
  assert.equal(sourceCovers('./apps/one', 'apps/one'), true);
  assert.equal(sourceCovers('apps', 'apps/one'), true);
  assert.equal(sourceCovers('.', 'apps/one'), true);
  assert.equal(sourceCovers('apps/other/package.json', 'apps/one'), false);
  assert.equal(sourceCovers('apps-extra', 'apps/one'), false);
});

test('the real repository passes, and copilot-core is a workspace project (L3)', () => {
  assert.ok(listWorkspaceProjects(repoRoot).includes('services/copilot-core'));
  assert.deepEqual(findMissingManifests(repoRoot), []);
});
