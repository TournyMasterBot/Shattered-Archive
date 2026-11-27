import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkImpact, findDocHits, findIndexGaps } from './check-doc-impact.mjs';

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docimpact-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('a doc that names a changed code file by name or stem is a hit; a changed doc is not', () => {
  const docs = new Map([
    ['docs/game/feature.md', 'See `autoleveling-engine.ts` for the loop.'],
    ['docs/other.md', 'The autoleveling-engine handles it.'],
    ['docs/unrelated.md', 'Nothing here.'],
    ['docs/updated.md', 'autoleveling-engine.ts again'],
  ]);
  const hits = findDocHits(['src/autoleveling-engine.ts', 'docs/updated.md'], docs);
  assert.deepEqual(hits, [
    { doc: 'docs/game/feature.md', names: ['autoleveling-engine.ts'] },
    { doc: 'docs/other.md', names: ['autoleveling-engine.ts'] },
  ]);
});

test('tests, snapshots, images, json and index files never make a doc hit, and a short stem is ignored', () => {
  const docs = new Map([['docs/a.md', 'engine.test.ts classes.json shot.png app.ts .annotated']]);
  assert.deepEqual(findDocHits(['src/engine.test.ts', 'src/classes.json', 'x/shot.png', 'src/app.ts', 'src/.annotated'], docs), []);
});

test('a folder with an index and changed code is a gap until its index is changed too', () => {
  const root = makeRoot({ 'tools/hooks/.annotated': 'x', 'tools/hooks/guard.js': '', 'plain/code.js': '' });
  assert.deepEqual(findIndexGaps(['tools/hooks/guard.js'], root), ['tools/hooks']);
  assert.deepEqual(findIndexGaps(['tools/hooks/guard.js', 'tools/hooks/.annotated'], root), []);
});

test('the nearest ancestor index decides, and a folder with no index above it is not a gap', () => {
  const root = makeRoot({ 'pkg/.ai-context': 'x', 'pkg/deep/deeper/file.ts': '', 'free/file.ts': '' });
  assert.deepEqual(findIndexGaps(['pkg/deep/deeper/file.ts'], root), ['pkg']);
  assert.deepEqual(findIndexGaps(['free/file.ts'], root), []);
});

test('findings are resolved by naming the doc or the folder in test-results.md', () => {
  const root = makeRoot({ 'tools/hooks/.annotated': 'x', 'tools/hooks/guard-thing.js': '' });
  const docs = new Map([['docs/guards.md', 'describes guard-thing.js']]);
  const changed = ['tools/hooks/guard-thing.js'];
  const open = checkImpact({ changed, root, docs, resolvedText: '' });
  assert.equal(open.unresolvedHits.length, 1);
  assert.deepEqual(open.unresolvedGaps, ['tools/hooks']);

  const done = checkImpact({
    changed,
    root,
    docs,
    resolvedText: 'Checked, still accurate: docs/guards.md (describes behavior only). tools/hooks index: unrelated change.',
  });
  assert.deepEqual(done.unresolvedHits, []);
  assert.deepEqual(done.unresolvedGaps, []);
  assert.equal(done.resolvedHits + done.resolvedGaps, 2);
});

test('--files runs the check on a planned file set and exits 1 while findings are open', () => {
  const root = makeRoot({ 'docs/guide.md': 'covers planned-feature-file.ts', 'tools/.annotated': 'x', 'tools/planned-feature-file.ts': '' });
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-doc-impact.mjs');
  const item = path.join(root, 'item');
  fs.mkdirSync(item);
  fs.writeFileSync(path.join(item, 'test-results.md'), 'nothing recorded yet');
  const run = spawnSync(process.execPath, [script, item, root, '--files', 'tools/planned-feature-file.ts'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /DOC\s+docs\/guide\.md/);
  assert.match(run.stdout, /INDEX\s+tools\//);
});
