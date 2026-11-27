import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodeLedgerFs, nodeWorldIo } from './fs';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-fs-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('nodeLedgerFs', () => {
  it('append creates the folder and the file, and appends after that', async () => {
    const file = path.join(dir, 'a', 'b', 'x.jsonl');
    await nodeLedgerFs.append(file, 'one\n');
    await nodeLedgerFs.append(file, 'two\n');
    expect(fs.readFileSync(file, 'utf8')).toBe('one\ntwo\n');
  });

  it('read returns the text, and undefined for a missing file', async () => {
    const file = path.join(dir, 'x.jsonl');
    expect(await nodeLedgerFs.read(file)).toBeUndefined();
    fs.writeFileSync(file, 'hello');
    expect(await nodeLedgerFs.read(file)).toBe('hello');
  });

  it('read rethrows an error that is not "missing" (a folder where a file is expected)', async () => {
    await expect(nodeLedgerFs.read(dir)).rejects.toThrow();
  });

  it('size returns the byte count, and undefined for a missing file', async () => {
    const file = path.join(dir, 'x.jsonl');
    expect(await nodeLedgerFs.size(file)).toBeUndefined();
    fs.writeFileSync(file, 'abcd');
    expect(await nodeLedgerFs.size(file)).toBe(4);
  });

  it('size rethrows an error that is not "missing" (an invalid path)', async () => {
    await expect(nodeLedgerFs.size(path.join(dir, 'bad\0name'))).rejects.toThrow();
  });

  it('rename moves a file', async () => {
    const from = path.join(dir, 'x.jsonl');
    const to = path.join(dir, 'x.jsonl.1');
    fs.writeFileSync(from, 'data');
    await nodeLedgerFs.rename(from, to);
    expect(fs.existsSync(from)).toBe(false);
    expect(fs.readFileSync(to, 'utf8')).toBe('data');
  });

  it('list returns the full paths of files starting with the prefix, and not look-alikes in other names', async () => {
    fs.writeFileSync(path.join(dir, 'x.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'x.jsonl.1'), '');
    fs.writeFileSync(path.join(dir, 'x.jsonl.2'), '');
    fs.writeFileSync(path.join(dir, 'y.jsonl.1'), '');
    expect((await nodeLedgerFs.list(path.join(dir, 'x.jsonl.'))).sort()).toEqual([
      path.join(dir, 'x.jsonl.1'),
      path.join(dir, 'x.jsonl.2'),
    ]);
  });

  it('list is empty when the folder does not exist, and rethrows other errors', async () => {
    expect(await nodeLedgerFs.list(path.join(dir, 'no-such-folder', 'x.jsonl.'))).toEqual([]);
    const aFile = path.join(dir, 'plain');
    fs.writeFileSync(aFile, '');
    await expect(nodeLedgerFs.list(path.join(aFile, 'x.jsonl.'))).rejects.toThrow();
  });
});

describe('nodeWorldIo', () => {
  it('reads a missing file as absent, writes whole files into new folders, and replaces them without leaving a temporary file', async () => {
    const file = path.join(dir, 'a', 'b', 'memory.json');
    expect(await nodeWorldIo.readText(file)).toBeUndefined();
    await nodeWorldIo.writeText(file, 'first');
    await nodeWorldIo.writeText(file, 'second');
    expect(await nodeWorldIo.readText(file)).toBe('second');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['memory.json']);
  });

  it('reports a read failure that is not "missing" (a folder where the file should be)', async () => {
    await expect(nodeWorldIo.readText(dir)).rejects.toBeDefined();
  });
});
