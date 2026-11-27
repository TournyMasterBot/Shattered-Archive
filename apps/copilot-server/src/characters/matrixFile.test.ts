import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readMatrixFile } from './matrixFile';

let dir: string;
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-matrix-'))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readMatrixFile', () => {
  it('loads a matrix file and counts accepted and rejected rows', async () => {
    const file = path.join(dir, 'm.json');
    fs.writeFileSync(file, JSON.stringify([{ codename: 'Agate', male: 'Zorvak', female: 'Quenta' }, { codename: 'Agate', male: 'Other' }, 5]));
    const loaded = await readMatrixFile(file);
    expect(loaded).toMatchObject({ rows: 1, rejected: 2 });
    expect(loaded.matrix?.lookup('zorvak')).toEqual({ codename: 'Agate', gender: 'M' });
  });

  it('gives no matrix for a missing file, invalid JSON or JSON that is not a list, without throwing', async () => {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{not json');
    const notList = path.join(dir, 'obj.json');
    fs.writeFileSync(notList, '{"rows": []}');
    for (const file of [path.join(dir, 'missing.json'), bad, notList]) {
      expect(await readMatrixFile(file)).toEqual({ matrix: undefined, rows: 0, rejected: 0 });
    }
  });

  it('uses the reader it is given, and an error from it carries nothing out', async () => {
    const loaded = await readMatrixFile('/anywhere.json', async () => {
      throw new Error('EACCES: /secret/place Zorvak');
    });
    expect(JSON.stringify(loaded)).not.toContain('secret');
    expect(loaded.matrix).toBeUndefined();
    const ok = await readMatrixFile('/anywhere.json', async () => '[{"codename":"C001","male":"Tamsin"}]');
    expect(ok.rows).toBe(1);
  });
});
