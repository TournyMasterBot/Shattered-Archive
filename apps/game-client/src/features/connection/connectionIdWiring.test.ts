/**
 * The per-connection stores must all key their storage through the same rule
 * (see connectionId.ts), or a script saved before the socket opens (`default` in
 * older builds) lands somewhere the connected client (`dsl-mud`) never reads.
 */
import { getUserScriptStorageKey } from '../../hooks/useUserScriptSandbox';
import { getUserVariablesStorageKey } from '../userScripts/userVariablesStore';
import { UserScriptRuntime } from '../userScripts/userScriptRuntime';

const SCRIPTS = 'shatteredArchive.userScripts.';
const VARS = 'shatteredArchive.userVariables.';

describe('storage keys use the canonical connection id', () => {
  it.each([
    ['legacy default', 'default'],
    ['empty', ''],
    ['undefined', undefined],
    ['null', null],
    ['whitespace', '   '],
  ])('user scripts key for %s resolves to dsl-mud (hook key)', (_label, id) => {
    expect(getUserScriptStorageKey(id as string | null | undefined)).toBe(`${SCRIPTS}dsl-mud`);
  });

  it('keeps a custom server separate in the hook key', () => {
    expect(getUserScriptStorageKey('mud.example.com:4000')).toBe(`${SCRIPTS}mud.example.com:4000`);
  });

  it('runtime and hook agree on the user scripts key for every id', () => {
    const runtime = new UserScriptRuntime({} as never);
    for (const id of ['dsl-mud', 'default', undefined, ' ', 'mud.example.com:4000']) {
      expect(runtime.getStorageKey(id as string | undefined)).toBe(getUserScriptStorageKey(id as string | undefined));
    }
    expect(runtime.getStorageKey('default')).toBe(`${SCRIPTS}dsl-mud`);
  });

  it('named variables key folds default into dsl-mud and keeps custom servers apart', () => {
    expect(getUserVariablesStorageKey('default')).toBe(`${VARS}dsl-mud`);
    expect(getUserVariablesStorageKey(undefined)).toBe(`${VARS}dsl-mud`);
    expect(getUserVariablesStorageKey('mud.example.com:4000')).toBe(`${VARS}mud.example.com:4000`);
  });
});

describe('connectionIdMigrationBoot', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.resetModules();
  });

  it('migrates legacy localStorage as soon as it is imported, before anything else runs', async () => {
    window.localStorage.setItem(`${SCRIPTS}default`, JSON.stringify([{ id: 'farm' }]));

    let boot!: typeof import('./connectionIdMigrationBoot');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      boot = require('./connectionIdMigrationBoot');
    });

    // Synchronous half is done by the time the import returns.
    expect(window.localStorage.getItem(`${SCRIPTS}default`)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(`${SCRIPTS}dsl-mud`)!)).toEqual([{ id: 'farm' }]);

    const report = await boot.connectionIdMigrationReady;
    expect(report.moved).toEqual([`${SCRIPTS}default`]);
  });
});

describe('main.tsx start-up order', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('renders the app only after the migration promise settles, with data already migrated', async () => {
    window.localStorage.setItem(`${SCRIPTS}default`, JSON.stringify([{ id: 'farm' }]));

    const seenAtRender: Array<string | null> = [];
    const render = jest.fn(() => {
      seenAtRender.push(window.localStorage.getItem(`${SCRIPTS}dsl-mud`));
    });
    const createRoot = jest.fn(() => ({ render }));

    jest.doMock('react-dom/client', () => ({ __esModule: true, default: { createRoot }, createRoot }));
    jest.doMock('../../App', () => ({ App: () => null }));
    jest.doMock('../../styles/Global.module.scss', () => ({}));

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../main');
    });

    // The IndexedDB half is async, so nothing renders synchronously.
    expect(render).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 0));

    expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(render).toHaveBeenCalledTimes(1);
    expect(JSON.parse(seenAtRender[0]!)).toEqual([{ id: 'farm' }]);
  });
});
