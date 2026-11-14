import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { namesFromMatrix, namesFromText, scanFiles } from './check-private-names.mjs';

const scratch = [];
after(() => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-names-'));
  scratch.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('names come from both matrix columns; malformed rows and names are skipped', () => {
  const names = namesFromMatrix([
    { codename: 'A', male: 'Zorvak', female: 'Quenta' },
    { codename: 'B', male: null, female: 'two words' },
    null,
    'x',
    { codename: 'C', male: 5 },
  ]);
  assert.deepEqual(names, ['Zorvak', 'Quenta']);
  assert.throws(() => namesFromMatrix({}), TypeError);
});

test('names from a text file: one per line, blanks and non-names ignored', () => {
  assert.deepEqual(namesFromText('Zorvak\r\n\n  Quenta  \n# comment\nnot a name here\n'), ['Zorvak', 'Quenta']);
});

test('finds a name as a whole word, case-insensitively, and reports file and line only', () => {
  const root = repo({
    'docs/a.md': 'nothing here\nthe ZORVAK was seen\n',
    'docs/b.md': 'clean',
    'src/c.ts': "const x = 'quenta';\n",
  });
  const hits = scanFiles(root, ['docs/a.md', 'docs/b.md', 'src/c.ts'], ['Zorvak', 'Quenta']);
  assert.deepEqual(hits, [
    { file: 'docs/a.md', line: 2 },
    { file: 'src/c.ts', line: 1 },
  ]);
  assert.ok(!JSON.stringify(hits).toLowerCase().includes('zorvak'));
});

test('does not flag a name that is only part of a longer word', () => {
  const root = repo({ 'a.md': 'Zorvakian and unquentas and Quentaful' });
  assert.deepEqual(scanFiles(root, ['a.md'], ['Zorvak', 'Quenta']), []);
});

test('skips binary extensions, oversize files and files that no longer exist', () => {
  const root = repo({ 'img.png': 'Zorvak', 'big.txt': `Zorvak ${'x'.repeat(2 * 1024 * 1024)}` });
  assert.deepEqual(scanFiles(root, ['img.png', 'big.txt', 'gone.md'], ['Zorvak']), []);
});

test('an empty name list finds nothing', () => {
  const root = repo({ 'a.md': 'Zorvak' });
  assert.deepEqual(scanFiles(root, ['a.md'], []), []);
});

test('a name with an apostrophe or hyphen is matched and escaped', () => {
  const root = repo({ 'a.md': "meet O'Reil-ly today" });
  assert.equal(scanFiles(root, ['a.md'], ["O'Reil-ly"]).length, 1);
});
