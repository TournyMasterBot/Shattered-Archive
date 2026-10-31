import {
  MIGRATION_BACKUP_PREFIX,
  mergeGlobalScriptPayloads,
  mergeGlobalSources,
  mergeRecords,
  mergeScriptLists,
  mergeVarPayloads,
  migrateLocalStorage,
  moveKeyedRow,
  preferNonBlank,
  relabelRows,
  runConnectionIdMigration,
  type RowStore,
} from './connectionIdMigration';

const S = 'shatteredArchive.userScripts.';
const G = 'shatteredArchive.userGlobalScripts.';
const V = 'shatteredArchive.userGlobalVars.';

const payload = (sources: Record<string, string>) =>
  JSON.stringify({
    schema: 'shatteredArchive.globalScripts.v1',
    sources: { javascript: '', lua: '', python: '', typescript: '', ...sources },
  });

const backupKeys = () =>
  Object.keys(window.localStorage).filter((k) => k.startsWith(MIGRATION_BACKUP_PREFIX));

beforeEach(() => window.localStorage.clear());

describe('merge helpers', () => {
  it('mergeScriptLists keeps the preferred copy of a shared id and adds the others', () => {
    const preferred = JSON.stringify([{ id: 'a', source: 'new' }, { id: 'b' }]);
    const other = JSON.stringify([{ id: 'a', source: 'old' }, { id: 'c' }]);
    expect(JSON.parse(mergeScriptLists(preferred, other))).toEqual([
      { id: 'a', source: 'new' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('mergeScriptLists falls back to whichever side is a valid list', () => {
    const list = JSON.stringify([{ id: 'x' }]);
    expect(mergeScriptLists('not json', list)).toBe(list);
    expect(mergeScriptLists(list, 'not json')).toBe(list);
    expect(mergeScriptLists('not json', 'also bad')).toBe('not json');
  });

  it('mergeScriptLists ignores list entries that have no string id', () => {
    const preferred = JSON.stringify([{ id: 'a' }, 'loose', { name: 'no id' }]);
    const other = JSON.stringify([{ name: 'also no id' }, { id: 'c' }]);
    expect(JSON.parse(mergeScriptLists(preferred, other))).toEqual([
      { id: 'a' },
      'loose',
      { name: 'no id' },
      { id: 'c' },
    ]);
  });

  it('mergeGlobalSources takes the preferred language when non-empty, else the other', () => {
    expect(
      mergeGlobalSources({ javascript: 'mine', lua: '' }, { javascript: 'theirs', lua: 'theirs-lua', python: 'py' }),
    ).toEqual({ javascript: 'mine', lua: 'theirs-lua', python: 'py', typescript: '' });
  });

  it('mergeGlobalSources treats a non-string preferred or other value as empty', () => {
    expect(mergeGlobalSources({ javascript: 5, lua: null }, { javascript: 7, lua: 'ok' })).toEqual({
      javascript: '',
      lua: 'ok',
      python: '',
      typescript: '',
    });
  });

  it('mergeGlobalScriptPayloads keeps schema and merges per language', () => {
    const merged = JSON.parse(
      mergeGlobalScriptPayloads(payload({ javascript: 'farm()' }), payload({ javascript: 'old', lua: 'x = 1' })),
    );
    expect(merged.schema).toBe('shatteredArchive.globalScripts.v1');
    expect(merged.sources).toMatchObject({ javascript: 'farm()', lua: 'x = 1' });
  });

  it('mergeVarPayloads merges key by key, preferred wins', () => {
    const merged = JSON.parse(
      mergeVarPayloads(
        JSON.stringify({ schema: 's', vars: { target: 'weed', a: 1 } }),
        JSON.stringify({ schema: 's', vars: { target: 'old', b: 2 } }),
      ),
    );
    expect(merged.vars).toEqual({ target: 'weed', a: 1, b: 2 });
  });

  it('the payload and record merges fall back to whichever side is valid, else keep the preferred raw', () => {
    const globals = payload({ lua: 'x' });
    expect(mergeGlobalScriptPayloads('garbage', globals)).toBe(globals);
    expect(mergeGlobalScriptPayloads(globals, 'garbage')).toBe(globals);
    expect(mergeGlobalScriptPayloads('garbage', 'also garbage')).toBe('garbage');

    const vars = JSON.stringify({ schema: 's', vars: { a: 1 } });
    expect(mergeVarPayloads('garbage', vars)).toBe(vars);
    expect(mergeVarPayloads(vars, 'garbage')).toBe(vars);
    expect(mergeVarPayloads('garbage', '[]')).toBe('garbage');

    expect(mergeRecords('garbage', '{"a":1}')).toBe('{"a":1}');
    expect(mergeRecords('{"a":1}', 'garbage')).toBe('{"a":1}');
    expect(mergeRecords('garbage', '[]')).toBe('garbage');
  });

  it('mergeRecords and preferNonBlank prefer the first argument', () => {
    expect(JSON.parse(mergeRecords('{"a":1}', '{"a":2,"b":3}'))).toEqual({ a: 1, b: 3 });
    expect(preferNonBlank('  ', 'fallback')).toBe('fallback');
    expect(preferNonBlank('mine', 'fallback')).toBe('mine');
  });
});

describe('migrateLocalStorage (default -> dsl-mud)', () => {
  it('moves a legacy-only key to dsl-mud without a backup and removes the old key', () => {
    window.localStorage.setItem(`${S}default`, JSON.stringify([{ id: 'a' }]));

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(window.localStorage.getItem(`${S}default`)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(`${S}dsl-mud`)!)).toEqual([{ id: 'a' }]);
    expect(report.moved).toEqual([`${S}default`]);
    expect(backupKeys()).toEqual([]);
  });

  it('merges scripts present on both sides, dsl-mud winning, with a backup of both raw values first', () => {
    window.localStorage.setItem(`${S}default`, JSON.stringify([{ id: 'both', v: 'default' }, { id: 'only-default' }]));
    window.localStorage.setItem(`${S}dsl-mud`, JSON.stringify([{ id: 'farm' }, { id: 'both', v: 'dsl' }]));

    const report = migrateLocalStorage(window.localStorage, 7);

    const merged = JSON.parse(window.localStorage.getItem(`${S}dsl-mud`)!);
    expect(merged).toEqual([{ id: 'farm' }, { id: 'both', v: 'dsl' }, { id: 'only-default' }]);
    expect(window.localStorage.getItem(`${S}default`)).toBeNull();
    expect(report.merged).toEqual([`${S}default`]);

    const backup = JSON.parse(window.localStorage.getItem(`${MIGRATION_BACKUP_PREFIX}7.${S}default`)!);
    expect(JSON.parse(backup.default)).toEqual([{ id: 'both', v: 'default' }, { id: 'only-default' }]);
    expect(JSON.parse(backup['dsl-mud'])).toEqual([{ id: 'farm' }, { id: 'both', v: 'dsl' }]);
  });

  it('keeps a Globals script saved while disconnected when dsl-mud has a different language', () => {
    window.localStorage.setItem(`${G}default`, payload({ javascript: 'saved while disconnected' }));
    window.localStorage.setItem(`${G}dsl-mud`, payload({ lua: 'saved while connected' }));

    migrateLocalStorage(window.localStorage, 1);

    const sources = JSON.parse(window.localStorage.getItem(`${G}dsl-mud`)!).sources;
    expect(sources.javascript).toBe('saved while disconnected');
    expect(sources.lua).toBe('saved while connected');
  });

  it('on a same-language conflict keeps the dsl-mud global script', () => {
    window.localStorage.setItem(`${G}default`, payload({ javascript: 'from default' }));
    window.localStorage.setItem(`${G}dsl-mud`, payload({ javascript: 'from dsl-mud' }));

    migrateLocalStorage(window.localStorage, 1);

    expect(JSON.parse(window.localStorage.getItem(`${G}dsl-mud`)!).sources.javascript).toBe('from dsl-mud');
  });

  it('prefers the dsl-mud global var on a conflict and keeps the default-only ones', () => {
    window.localStorage.setItem(`${V}default`, JSON.stringify({ schema: 's', vars: { target: 'old', extra: 1 } }));
    window.localStorage.setItem(`${V}dsl-mud`, JSON.stringify({ schema: 's', vars: { target: 'weed' } }));

    migrateLocalStorage(window.localStorage, 1);

    expect(JSON.parse(window.localStorage.getItem(`${V}dsl-mud`)!).vars).toEqual({ target: 'weed', extra: 1 });
  });

  it('moves per-plugin css overrides keyed with a dotted plugin id', () => {
    const old = 'shatteredArchive.pluginCssOverride.default.tts';
    window.localStorage.setItem(old, '.x{color:red}');

    migrateLocalStorage(window.localStorage, 1);

    expect(window.localStorage.getItem(old)).toBeNull();
    expect(window.localStorage.getItem('shatteredArchive.pluginCssOverride.dsl-mud.tts')).toBe('.x{color:red}');
  });

  it('rewrites the connection-keyed equipment blobs, including the inner connectionId, with a backup', () => {
    const key = 'shatteredArchive.equipment.state.v1';
    const original = JSON.stringify({
      default: { connectionId: 'default', slots: { wielded: 'sword' } },
      'host:1': { connectionId: 'host:1' },
    });
    window.localStorage.setItem(key, original);

    migrateLocalStorage(window.localStorage, 3);

    const next = JSON.parse(window.localStorage.getItem(key)!);
    expect(next.default).toBeUndefined();
    expect(next['dsl-mud']).toEqual({ connectionId: 'dsl-mud', slots: { wielded: 'sword' } });
    expect(next['host:1']).toEqual({ connectionId: 'host:1' });
    expect(window.localStorage.getItem(`${MIGRATION_BACKUP_PREFIX}3.${key}`)).toBe(original);
  });

  it('keeps an existing dsl-mud equipment entry and drops the default one (backed up)', () => {
    const key = 'shatteredArchive.equipment.state.v1';
    const original = JSON.stringify({
      default: { connectionId: 'default', slots: { wielded: 'stick' } },
      'dsl-mud': { connectionId: 'dsl-mud', slots: { wielded: 'sword' } },
    });
    window.localStorage.setItem(key, original);

    migrateLocalStorage(window.localStorage, 3);

    const next = JSON.parse(window.localStorage.getItem(key)!);
    expect(next.default).toBeUndefined();
    expect(next['dsl-mud']).toEqual({ connectionId: 'dsl-mud', slots: { wielded: 'sword' } });
    expect(window.localStorage.getItem(`${MIGRATION_BACKUP_PREFIX}3.${key}`)).toBe(original);
  });

  it('leaves custom server data alone', () => {
    window.localStorage.setItem(`${S}mud.example.com:4000`, JSON.stringify([{ id: 'x' }]));

    const report = migrateLocalStorage(window.localStorage, 1);

    expect(window.localStorage.getItem(`${S}mud.example.com:4000`)).not.toBeNull();
    expect(report.moved).toEqual([]);
    expect(report.merged).toEqual([]);
  });

  it('is idempotent and never re-migrates its own backups', () => {
    window.localStorage.setItem(`${S}default`, JSON.stringify([{ id: 'a' }]));
    window.localStorage.setItem(`${S}dsl-mud`, JSON.stringify([{ id: 'b' }]));

    migrateLocalStorage(window.localStorage, 1);
    const snapshot = { ...window.localStorage };
    const second = migrateLocalStorage(window.localStorage, 2);

    expect(second.moved).toEqual([]);
    expect(second.merged).toEqual([]);
    expect({ ...window.localStorage }).toEqual(snapshot);
  });

  it('folds a legacy key that reappears later (stale tab, old cloud load) on the next run', () => {
    migrateLocalStorage(window.localStorage, 1);
    window.localStorage.setItem(`${S}default`, JSON.stringify([{ id: 'late' }]));

    const report = migrateLocalStorage(window.localStorage, 2);

    expect(report.moved).toEqual([`${S}default`]);
    expect(JSON.parse(window.localStorage.getItem(`${S}dsl-mud`)!)).toEqual([{ id: 'late' }]);
  });

  it('leaves both keys untouched when the backup cannot be written (quota)', () => {
    const oldRaw = JSON.stringify([{ id: 'a' }]);
    const newRaw = JSON.stringify([{ id: 'b' }]);
    window.localStorage.setItem(`${S}default`, oldRaw);
    window.localStorage.setItem(`${S}dsl-mud`, newRaw);

    const realSetItem = Storage.prototype.setItem;
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (k.startsWith(MIGRATION_BACKUP_PREFIX)) throw new Error('QuotaExceededError');
      realSetItem.call(this, k, v);
    });

    const report = migrateLocalStorage(window.localStorage, 1);
    spy.mockRestore();

    expect(report.skipped).toEqual([`${S}default`]);
    expect(window.localStorage.getItem(`${S}default`)).toBe(oldRaw);
    expect(window.localStorage.getItem(`${S}dsl-mud`)).toBe(newRaw);
  });
});

function fakeStore<Row extends { connectionId?: unknown }>(rows: Row[], keyOf: (r: Row) => string) {
  const data = new Map(rows.map((r) => [keyOf(r), r]));
  const store: RowStore<Row> = {
    all: async () => [...data.values()],
    put: async (row) => void data.set(keyOf(row), row),
    remove: async (key) => void data.delete(key),
  };
  return { store, data };
}

describe('relabelRows (library)', () => {
  it('re-labels only legacy default rows and keeps their ids', async () => {
    const { store, data } = fakeStore(
      [
        { id: '1', connectionId: 'default', title: 'note' },
        { id: '2', connectionId: 'dsl-mud', title: 'other' },
        { id: '3', connectionId: 'host:1', title: 'custom' },
      ],
      (r) => r.id,
    );

    expect(await relabelRows(store)).toBe(1);

    expect(data.get('1')).toEqual({ id: '1', connectionId: 'dsl-mud', title: 'note' });
    expect(data.get('2')?.connectionId).toBe('dsl-mud');
    expect(data.get('3')?.connectionId).toBe('host:1');
  });
});

describe('moveKeyedRow (equipment)', () => {
  it('keeps the dsl-mud row and drops the default one, handing the dropped row to the backup', async () => {
    const { store, data } = fakeStore(
      [
        { connectionId: 'default', wielded: 'stick' },
        { connectionId: 'dsl-mud', wielded: 'sword' },
      ],
      (r) => r.connectionId as string,
    );
    const backed: unknown[] = [];

    expect(await moveKeyedRow(store, (row) => backed.push(row))).toBe(1);

    expect(backed).toEqual([{ connectionId: 'default', wielded: 'stick' }]);
    expect(data.get('dsl-mud')).toEqual({ connectionId: 'dsl-mud', wielded: 'sword' });
    expect(data.has('default')).toBe(false);
  });

  it('moves the default row onto dsl-mud when there is none, with nothing to back up', async () => {
    const { store, data } = fakeStore([{ connectionId: 'default', wielded: 'stick' }], (r) => r.connectionId as string);
    const backed: unknown[] = [];

    expect(await moveKeyedRow(store, (row) => backed.push(row))).toBe(1);

    expect(backed).toEqual([]);
    expect(data.get('dsl-mud')).toEqual({ connectionId: 'dsl-mud', wielded: 'stick' });
    expect(data.has('default')).toBe(false);
  });

  it('does nothing when there is no default row', async () => {
    const { store, data } = fakeStore([{ connectionId: 'dsl-mud', wielded: 'sword' }], (r) => r.connectionId as string);
    expect(await moveKeyedRow(store, () => undefined)).toBe(0);
    expect(data.get('dsl-mud')).toEqual({ connectionId: 'dsl-mud', wielded: 'sword' });
  });
});

describe('runConnectionIdMigration', () => {
  it('migrates localStorage synchronously and resolves with a report even without IndexedDB', async () => {
    window.localStorage.setItem(`${S}default`, JSON.stringify([{ id: 'a' }]));

    const pending = runConnectionIdMigration();

    // Synchronous half: already done before the promise settles.
    expect(window.localStorage.getItem(`${S}dsl-mud`)).not.toBeNull();

    const report = await pending;
    expect(report.moved).toEqual([`${S}default`]);
    expect(report.rows).toBe(0);
  });
});
