import type { Decision } from '../contracts';
import { validateDecision } from './records';
import { JsonlStore, type LedgerFs } from './store';

/** An in-memory file system. `failNext` makes the next append throw, optionally after writing part of the text. */
class FakeFs implements LedgerFs {
  files = new Map<string, string>();
  failNext: { partial: boolean } | null = null;
  failRename = false;
  appends = 0;

  async append(path: string, text: string): Promise<void> {
    this.appends++;
    if (this.failNext) {
      const { partial } = this.failNext;
      this.failNext = null;
      if (partial) this.files.set(path, (this.files.get(path) ?? '') + text.slice(0, Math.floor(text.length / 2)));
      throw new Error('disk full');
    }
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }
  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }
  async size(path: string): Promise<number | undefined> {
    const text = this.files.get(path);
    return text === undefined ? undefined : text.length;
  }
  async rename(from: string, to: string): Promise<void> {
    if (this.failRename) throw new Error('rename denied');
    this.files.set(to, this.files.get(from) ?? '');
    this.files.delete(from);
  }
  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix));
  }
}

const PATH = '/data/ledger/decisions.jsonl';
const decision = (id: string, overrides: Partial<Decision> = {}): Decision => ({
  id,
  suggestionId: 's1',
  character: 'Agate-F',
  at: 1000,
  outcome: 'approved',
  command: 'north',
  ...overrides,
});

async function open(fs: FakeFs, maxBytes?: number) {
  return JsonlStore.open<Decision>({ fs, path: PATH, validate: validateDecision, maxBytes });
}

describe('JsonlStore: append and query', () => {
  it('appends records and returns them in the order they first appeared', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    expect(await store.append(decision('a'))).toEqual({ ok: true, written: true });
    expect(await store.append(decision('b'))).toEqual({ ok: true, written: true });
    expect(store.query().map((d) => d.id)).toEqual(['a', 'b']);
    expect(store.get('a')?.command).toBe('north');
    expect(store.get('missing')).toBeUndefined();
    expect(fs.files.get(PATH)?.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('keeps one record when the same id is appended twice with the same content (a retry)', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    await store.append(decision('a'));
    expect(await store.append(decision('a'))).toEqual({ ok: true, written: false });
    expect(store.query()).toHaveLength(1);
    expect(fs.appends).toBe(1);
  });

  it('keeps the latest version when the same id is appended with changed content, in its original position', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    await store.append(decision('a'));
    await store.append(decision('b'));
    await store.append(decision('a', { outcome: 'corrected', command: 'open door' }));
    expect(store.query().map((d) => [d.id, d.outcome])).toEqual([['a', 'corrected'], ['b', 'approved']]);
  });

  it('filters', async () => {
    const { store } = await open(new FakeFs());
    await store.append(decision('a'));
    await store.append(decision('b', { outcome: 'rejected', command: undefined }));
    expect(store.query((d) => d.outcome === 'rejected').map((d) => d.id)).toEqual(['b']);
  });

  it('refuses an invalid record without writing anything', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    const result = await store.append(decision('../bad'));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('invalid record');
    expect(fs.appends).toBe(0);
    expect(store.query()).toEqual([]);
  });

  it('serialises appends made without waiting', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.append(decision(`d${i}`))));
    expect(store.query()).toHaveLength(25);
    expect(fs.files.get(PATH)?.split('\n').filter(Boolean)).toHaveLength(25);
  });
});

describe('JsonlStore: reload', () => {
  it('rebuilds the same records from the file', async () => {
    const fs = new FakeFs();
    const first = (await open(fs)).store;
    await first.append(decision('a'));
    await first.append(decision('b'));
    await first.append(decision('a', { outcome: 'rejected', command: undefined }));
    const { store, report } = await open(fs);
    expect(report).toEqual({ records: 2, skipped: 0 });
    expect(store.query()).toEqual(first.query());
  });

  it('an empty or missing file loads as empty', async () => {
    const fs = new FakeFs();
    expect((await open(fs)).report).toEqual({ records: 0, skipped: 0 });
    fs.files.set(PATH, '');
    expect((await open(fs)).report).toEqual({ records: 0, skipped: 0 });
  });

  it('skips and reports a torn last line, and starts the next record on its own line', async () => {
    const fs = new FakeFs();
    const first = (await open(fs)).store;
    await first.append(decision('a'));
    fs.files.set(PATH, `${fs.files.get(PATH)}{"v":1,"r":{"id":"b","sugg`); // a crash in the middle of an append

    const { store, report } = await open(fs);
    expect(report).toEqual({ records: 1, skipped: 1 });
    expect(store.skipped).toBe(1);

    await store.append(decision('c'));
    const reloaded = await open(fs);
    expect(reloaded.store.query().map((d) => d.id)).toEqual(['a', 'c']);
    expect(reloaded.report.skipped).toBe(1); // the torn line is still there, and is still skipped
  });

  it('skips lines that are not JSON, have another schema version, or fail validation', async () => {
    const fs = new FakeFs();
    const good = JSON.stringify({ v: 1, r: decision('a') });
    fs.files.set(
      PATH,
      [
        good,
        'not json at all',
        JSON.stringify({ v: 2, r: decision('b') }),
        JSON.stringify({ v: 1, r: { id: 'c' } }),
        JSON.stringify([1, 2]),
        JSON.stringify(null),
        '',
      ].join('\n') + '\n',
    );
    const { store, report } = await open(fs);
    expect(report).toEqual({ records: 1, skipped: 5 });
    expect(store.query().map((d) => d.id)).toEqual(['a']);
  });

  it('a file that ends without a newline but with a complete record is kept, and the next append is separated', async () => {
    const fs = new FakeFs();
    fs.files.set(PATH, JSON.stringify({ v: 1, r: decision('a') })); // no trailing newline
    const { store, report } = await open(fs);
    expect(report).toEqual({ records: 1, skipped: 0 });
    await store.append(decision('b'));
    expect((await open(fs)).store.query().map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('JsonlStore: a failing file system', () => {
  it('returns the error and changes nothing when the write fails before any byte is written', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    await store.append(decision('a'));
    fs.failNext = { partial: false };
    const result = await store.append(decision('b'));
    expect(result).toEqual({ ok: false, error: 'disk full' });
    expect(store.query().map((d) => d.id)).toEqual(['a']);
    expect(fs.files.get(PATH)?.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('a retry after the failure succeeds', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    fs.failNext = { partial: false };
    expect((await store.append(decision('a'))).ok).toBe(false);
    expect(await store.append(decision('a'))).toEqual({ ok: true, written: true });
    expect(store.query()).toHaveLength(1);
  });

  it('after a half-written line the next record is still readable and the torn line is skipped', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs);
    await store.append(decision('a'));
    fs.failNext = { partial: true };
    expect((await store.append(decision('b'))).ok).toBe(false);
    expect(store.query().map((d) => d.id)).toEqual(['a']); // nothing half-applied in memory

    expect((await store.append(decision('c'))).ok).toBe(true);
    const reloaded = await open(fs);
    expect(reloaded.store.query().map((d) => d.id)).toEqual(['a', 'c']);
    expect(reloaded.report.skipped).toBe(1);
  });

  it('a validator that throws rejects that append but does not stop the later ones', async () => {
    const fs = new FakeFs();
    let explode = true;
    const { store } = await JsonlStore.open<Decision>({
      fs,
      path: PATH,
      validate: (value) => {
        if (explode) throw new Error('validator bug');
        return validateDecision(value);
      },
    });
    await expect(store.append(decision('a'))).rejects.toThrow('validator bug');
    explode = false;
    expect(await store.append(decision('a'))).toEqual({ ok: true, written: true });
    expect(store.query()).toHaveLength(1);
  });

  it('a non-Error failure still returns a message', async () => {
    const fs = new FakeFs();
    fs.append = async () => {
      throw 'plain string';
    };
    const { store } = await open(fs);
    expect(await store.append(decision('a'))).toEqual({ ok: false, error: 'write failed' });
  });
});

describe('JsonlStore: rotation by size', () => {
  it('moves the active file to .1 when it has reached maxBytes, and keeps every record queryable across a reload', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs, 300);
    for (let i = 0; i < 12; i++) await store.append(decision(`d${i}`));
    const archives = [...fs.files.keys()].filter((p) => /\.\d+$/.test(p)).sort();
    expect(archives.length).toBeGreaterThanOrEqual(2);
    expect(archives[0]).toBe(`${PATH}.1`);
    expect(store.query()).toHaveLength(12);

    const reloaded = await open(fs, 300);
    expect(reloaded.store.query().map((d) => d.id)).toEqual(Array.from({ length: 12 }, (_, i) => `d${i}`));
  });

  it('does not rotate below the limit', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs, 1_000_000);
    await store.append(decision('a'));
    expect([...fs.files.keys()]).toEqual([PATH]);
  });

  it('returns the error and appends nothing when the rotation fails', async () => {
    const fs = new FakeFs();
    const { store } = await open(fs, 1);
    await store.append(decision('a'));
    fs.failRename = true;
    const result = await store.append(decision('b'));
    expect(result).toEqual({ ok: false, error: 'rename denied' });
    expect(store.query().map((d) => d.id)).toEqual(['a']);
  });

  it('continues numbering after existing archives and ignores files that only look similar', async () => {
    const fs = new FakeFs();
    fs.files.set(`${PATH}.3`, `${JSON.stringify({ v: 1, r: decision('old') })}\n`);
    fs.files.set(`${PATH}.bak`, 'ignored');
    fs.files.set(`${PATH}.x7`, 'ignored');
    const { store } = await open(fs, 1);
    expect(store.get('old')).toBeDefined();
    await store.append(decision('a'));
    await store.append(decision('b'));
    expect(fs.files.has(`${PATH}.4`)).toBe(true);
  });
});
