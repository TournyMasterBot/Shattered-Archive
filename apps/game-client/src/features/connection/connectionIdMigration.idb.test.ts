/**
 * The IndexedDB half of dslMudMigration, driven through the real adapter
 * (openExistingDb / rowStore) against a small hand-written fake of the
 * IndexedDB API — jsdom has none, and the repo has no fake-indexeddb.
 */
import { MIGRATION_BACKUP_PREFIX, migrateLocalStorage, runConnectionIdMigration } from './connectionIdMigration';

const S = 'shatteredArchive.userScripts.';

type FakeRow = Record<string, unknown>;
type FakeDbSpec = Record<string, { keyPath: string; rows: FakeRow[] }>;

interface FakeIdbOptions {
  /** Fail `indexedDB.open` for this database name. */
  openError?: string;
  /** Abort every readwrite transaction. */
  abortWrites?: boolean;
  /** Omit `indexedDB.databases` (older browsers). */
  noDatabasesApi?: boolean;
}

function installFakeIndexedDb(spec: Record<string, FakeDbSpec>, options: FakeIdbOptions = {}) {
  const closed: string[] = [];
  const opened: string[] = [];

  const idb: Record<string, unknown> = {
    open(name: string) {
      opened.push(name);
      const req: { result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
      setTimeout(() => {
        if (options.openError === name) {
          req.error = new Error(`cannot open ${name}`);
          req.onerror?.();
          return;
        }
        const stores = spec[name];
        req.result = {
          objectStoreNames: { contains: (s: string) => s in stores },
          close: () => closed.push(name),
          transaction(storeName: string, mode: string) {
            const store = stores[storeName];
            const tx: { oncomplete?: () => void; onabort?: () => void; error?: unknown; objectStore?: unknown } = {};
            // Completion is scheduled AFTER the request callback so a handler assigned in the
            // request's continuation is in place before the transaction settles.
            const finishSoon = () =>
              setTimeout(() => {
                if (mode === 'readwrite' && options.abortWrites) {
                  tx.error = new Error('aborted');
                  tx.onabort?.();
                } else {
                  tx.oncomplete?.();
                }
              }, 0);
            tx.objectStore = () => ({
              getAll() {
                const r: { result?: unknown; onsuccess?: () => void } = {};
                setTimeout(() => {
                  r.result = store.rows.map((row) => ({ ...row }));
                  r.onsuccess?.();
                }, 0);
                finishSoon();
                return r;
              },
              put(row: FakeRow) {
                const at = store.rows.findIndex((x) => x[store.keyPath] === row[store.keyPath]);
                if (at >= 0) store.rows[at] = row;
                else store.rows.push(row);
                finishSoon();
              },
              delete(key: string) {
                store.rows = store.rows.filter((x) => x[store.keyPath] !== key);
                finishSoon();
              },
            });
            return tx;
          },
        };
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  if (!options.noDatabasesApi) {
    idb.databases = async () => Object.keys(spec).map((name) => ({ name }));
  }

  (globalThis as { indexedDB?: unknown }).indexedDB = idb;
  return { closed, opened, spec };
}

const backupKeys = () => Object.keys(window.localStorage).filter((k) => k.startsWith(MIGRATION_BACKUP_PREFIX));

const libraryDb = (): FakeDbSpec => ({
  notes: {
    keyPath: 'id',
    rows: [
      { id: 'n1', connectionId: 'default', title: 'legacy note' },
      { id: 'n2', connectionId: 'dsl-mud', title: 'already dsl-mud' },
    ],
  },
  books: { keyPath: 'id', rows: [{ id: 'b1', connectionId: 'default', title: 'legacy book' }] },
  // user_notes deliberately absent: a missing store is skipped, not an error
});

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  jest.restoreAllMocks();
});

describe('IndexedDB migration through the real adapter', () => {
  it('re-labels legacy library rows, skips a missing store, and closes the database', async () => {
    const fake = installFakeIndexedDb({ 'shatteredArchive.library': libraryDb() });

    const report = await runConnectionIdMigration();

    const db = fake.spec['shatteredArchive.library'];
    expect(db.notes.rows).toEqual([
      { id: 'n1', connectionId: 'dsl-mud', title: 'legacy note' },
      { id: 'n2', connectionId: 'dsl-mud', title: 'already dsl-mud' },
    ]);
    expect(db.books.rows).toEqual([{ id: 'b1', connectionId: 'dsl-mud', title: 'legacy book' }]);
    expect(report.rows).toBe(2);
    expect(report.skipped).toEqual([]);
    expect(fake.closed).toEqual(['shatteredArchive.library']);
  });

  it('keeps the dsl-mud equipment row, moves a lone default row across, and backs up the dropped one', async () => {
    const fake = installFakeIndexedDb({
      'shatteredArchive.equipment': {
        equipment_state: {
          keyPath: 'connectionId',
          rows: [
            { connectionId: 'default', wielded: 'stick' },
            { connectionId: 'dsl-mud', wielded: 'sword' },
          ],
        },
        equipment_prefs: { keyPath: 'connectionId', rows: [{ connectionId: 'default', dock: 'left' }] },
        profiles: { keyPath: 'connectionId', rows: [{ connectionId: 'host:1', name: 'custom' }] },
      },
    });

    const report = await runConnectionIdMigration();

    const db = fake.spec['shatteredArchive.equipment'];
    expect(db.equipment_state.rows).toEqual([{ connectionId: 'dsl-mud', wielded: 'sword' }]);
    expect(db.equipment_prefs.rows).toEqual([{ connectionId: 'dsl-mud', dock: 'left' }]);
    expect(db.profiles.rows).toEqual([{ connectionId: 'host:1', name: 'custom' }]);
    expect(report.rows).toBe(2);

    const backupKey = backupKeys().find((k) => k.endsWith('.idb.equipment_state.default'));
    expect(backupKey).toBeDefined();
    expect(JSON.parse(window.localStorage.getItem(backupKey!)!)).toEqual({ connectionId: 'default', wielded: 'stick' });
    expect(fake.closed).toEqual(['shatteredArchive.equipment']);
  });

  it('still migrates equipment when the backup of the dropped row cannot be written', async () => {
    const fake = installFakeIndexedDb({
      'shatteredArchive.equipment': {
        equipment_state: {
          keyPath: 'connectionId',
          rows: [
            { connectionId: 'default', wielded: 'stick' },
            { connectionId: 'dsl-mud', wielded: 'sword' },
          ],
        },
      },
    });
    const realSetItem = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k.includes('.idb.')) throw new Error('QuotaExceededError');
      realSetItem.call(this, k, v);
    });

    const report = await runConnectionIdMigration();

    expect(fake.spec['shatteredArchive.equipment'].equipment_state.rows).toEqual([
      { connectionId: 'dsl-mud', wielded: 'sword' },
    ]);
    expect(report.rows).toBe(1);
  });

  it('does not open a database that does not exist yet', async () => {
    const fake = installFakeIndexedDb({ 'some.other.db': {} });

    const report = await runConnectionIdMigration();

    expect(fake.opened).toEqual([]);
    expect(report.rows).toBe(0);
  });

  it('skips IndexedDB quietly when the browser has no databases() API', async () => {
    const fake = installFakeIndexedDb({ 'shatteredArchive.library': libraryDb() }, { noDatabasesApi: true });

    const report = await runConnectionIdMigration();

    expect(fake.opened).toEqual([]);
    expect(report.rows).toBe(0);
    expect(report.skipped).toEqual([]);
  });

  it('skips IndexedDB quietly when there is no indexedDB at all', async () => {
    const report = await runConnectionIdMigration();

    expect(report.rows).toBe(0);
    expect(report.skipped).toEqual([]);
  });

  it('records indexedDB as skipped, and still resolves, when a database fails to open', async () => {
    installFakeIndexedDb({ 'shatteredArchive.library': libraryDb() }, { openError: 'shatteredArchive.library' });

    const report = await runConnectionIdMigration();

    expect(report.skipped).toContain('indexedDB');
  });

  it('records indexedDB as skipped, and closes the database, when a write transaction aborts', async () => {
    const fake = installFakeIndexedDb({ 'shatteredArchive.library': libraryDb() }, { abortWrites: true });

    const report = await runConnectionIdMigration();

    expect(report.skipped).toContain('indexedDB');
    expect(fake.closed).toEqual(['shatteredArchive.library']);
  });
});

describe('failure handling', () => {
  it('records localStorage as skipped and still resolves when storage cannot be read', async () => {
    window.localStorage.setItem('anything', '1');
    jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const report = await runConnectionIdMigration();

    expect(report.skipped).toContain('localStorage');
  });

  it('leaves an equipment blob untouched and reports it skipped when it cannot be rewritten', () => {
    const key = 'shatteredArchive.equipment.prefs.v1';
    const original = JSON.stringify({ default: { connectionId: 'default', dock: 'left' } });
    window.localStorage.setItem(key, original);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(report.skipped).toEqual([key]);
    expect(window.localStorage.getItem(key)).toBe(original);
  });

  it('ignores an equipment blob that is not a JSON object or has no default entry', () => {
    window.localStorage.setItem('shatteredArchive.equipment.state.v1', 'not json');
    window.localStorage.setItem('shatteredArchive.equipment.prefs.v1', JSON.stringify({ 'dsl-mud': { a: 1 } }));

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(report.merged).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(window.localStorage.getItem('shatteredArchive.equipment.state.v1')).toBe('not json');
  });

  it('does nothing for a legacy key that disappears between listing and reading', () => {
    const key = `${S}default`;
    window.localStorage.setItem(key, JSON.stringify([{ id: 'a' }]));
    const realGetItem = Storage.prototype.getItem;
    // Another tab removed the key after it was listed: the read now comes back empty.
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k) {
      return k === key ? null : realGetItem.call(this, k);
    });

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(report).toEqual({ moved: [], merged: [], rows: 0, skipped: [] });
    expect(window.localStorage.getItem(`${S}dsl-mud`)).toBeNull();
    expect(backupKeys()).toEqual([]);
  });

  it('drops the default copy without a backup when both sides are byte-identical', () => {
    const raw = JSON.stringify([{ id: 'same' }]);
    window.localStorage.setItem(`${S}default`, raw);
    window.localStorage.setItem(`${S}dsl-mud`, raw);

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(report.moved).toEqual([`${S}default`]);
    expect(window.localStorage.getItem(`${S}dsl-mud`)).toBe(raw);
    expect(window.localStorage.getItem(`${S}default`)).toBeNull();
    expect(backupKeys()).toEqual([]);
  });

  it('skips a key when its copy does not persist, leaving the legacy value in place', () => {
    const oldRaw = JSON.stringify([{ id: 'a' }]);
    window.localStorage.setItem(`${S}default`, oldRaw);
    const realSetItem = Storage.prototype.setItem;
    // The write to the new key silently stores nothing (a lossy storage shim).
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k === `${S}dsl-mud`) return;
      realSetItem.call(this, k, v);
    });

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(report.skipped).toEqual([`${S}default`]);
    expect(window.localStorage.getItem(`${S}default`)).toBe(oldRaw);
  });
});
