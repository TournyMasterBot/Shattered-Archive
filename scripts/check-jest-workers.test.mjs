import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findViolations } from './check-jest-workers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeRepo({ scripts = {}, workflow = '', dockerfile = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jestworkers-'));
  fs.mkdirSync(path.join(root, 'apps', 'one'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'one', 'package.json'), JSON.stringify({ name: 'one', scripts }));
  fs.mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'node_modules', 'dep', 'package.json'),
    JSON.stringify({ scripts: { test: 'jest' } }), // inside node_modules: must be ignored
  );
  if (workflow) {
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), workflow);
  }
  if (dockerfile) {
    fs.mkdirSync(path.join(root, 'deploy'));
    fs.writeFileSync(path.join(root, 'deploy', 'x.Dockerfile'), dockerfile);
  }
  return root;
}

test('a package script that runs jest without a bound is reported with file, script name and command', () => {
  const root = makeRepo({ scripts: { test: 'jest --config ../../jest.config.cjs', lint: 'eslint .' } });
  assert.deepEqual(findViolations(root), [
    { file: 'apps/one/package.json', where: 'scripts.test', command: 'jest --config ../../jest.config.cjs' },
  ]);
});

test('--runInBand and --maxWorkers 1-4 pass, including behind cross-env', () => {
  const root = makeRepo({
    scripts: {
      a: 'jest --runInBand',
      b: 'cross-env NODE_OPTIONS=--max-old-space-size=8192 jest --config x --runInBand --coverage',
      c: 'jest --maxWorkers=4',
    },
  });
  assert.deepEqual(findViolations(root), []);
});

test('--maxWorkers above 4 or a percentage is reported', () => {
  const root = makeRepo({ scripts: { a: 'jest --maxWorkers=8', b: 'jest --maxWorkers=50%' } });
  assert.deepEqual(findViolations(root).map((v) => v.where), ['scripts.a', 'scripts.b']);
});

test('a workflow run: line and a Dockerfile RUN line are checked, with their line numbers', () => {
  const root = makeRepo({
    workflow: 'steps:\n  - name: t\n    run: pnpm exec jest --coverage\n  - name: ok\n    run: pnpm exec jest --runInBand\n',
    dockerfile: 'FROM node:24\nRUN pnpm exec jest\n# RUN pnpm exec jest in a comment is ignored\n',
  });
  assert.deepEqual(
    findViolations(root).map((v) => `${v.file}:${v.where}`),
    ['.github/workflows/ci.yml:line 3', 'deploy/x.Dockerfile:line 2'],
  );
});

test('a workflow step NAMED after jest is a label, not a command', () => {
  const root = makeRepo({ workflow: 'steps:\n  - name: Run Jest per app\n    run: node scripts/chained.cjs\n' });
  assert.deepEqual(findViolations(root), []);
});

test('a package.json inside node_modules is never scanned', () => {
  assert.deepEqual(findViolations(makeRepo()), []);
});

test('this repo: every jest invocation is bounded', () => {
  assert.deepEqual(findViolations(repoRoot), []);
});
