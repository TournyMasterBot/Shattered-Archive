import fs from 'fs';
import os from 'os';
import path from 'path';
import { JsonAccountStore } from './json-account-store.js';

function tmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kt-json-account-store-test-'));
}

describe('JsonAccountStore', () => {
  it('returns an empty list for an account with no file yet', () => {
    const store = new JsonAccountStore<{ x: number }>(tmpDataDir(), 'things');
    expect(store.list('acc1')).toEqual([]);
  });

  it('round-trips a saved list', () => {
    const store = new JsonAccountStore<{ x: number }>(tmpDataDir(), 'things');
    store.save('acc1', [{ x: 1 }, { x: 2 }]);
    expect(store.list('acc1')).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('keeps different accounts fully isolated', () => {
    const store = new JsonAccountStore<{ x: number }>(tmpDataDir(), 'things');
    store.save('acc1', [{ x: 1 }]);
    store.save('acc2', [{ x: 2 }]);
    expect(store.list('acc1')).toEqual([{ x: 1 }]);
    expect(store.list('acc2')).toEqual([{ x: 2 }]);
  });

  it('degrades a malformed file to an empty list rather than throwing', () => {
    const dataDir = tmpDataDir();
    const store = new JsonAccountStore<{ x: number }>(dataDir, 'things');
    fs.mkdirSync(path.join(dataDir, 'things'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'things', 'acc1.json'), 'not json{{{');
    expect(store.list('acc1')).toEqual([]);
  });

  it('rejects an accountId with path-traversal-shaped characters', () => {
    const store = new JsonAccountStore<{ x: number }>(tmpDataDir(), 'things');
    expect(() => store.save('../../etc/passwd', [{ x: 1 }])).toThrow(/invalid accountId/);
  });
});
