import { act, renderHook } from '@testing-library/react';
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

import { corePluginDefaults } from '../features/plugins/pluginConfigOverrides';
import { PluginHost } from '../features/plugins/pluginHost';
import {
  OVERRIDES_MIGRATED_KEY,
  PLUGINS_STORAGE_KEY,
  PLUGINS_UPDATED_EVENT,
  migratePluginConfigOverrides,
  readInstalledPlugins,
  usePlugins,
  writeInstalledPlugins,
  type InstalledPluginRecord,
} from './usePlugins';

// Guards the live-sync contract. Before this existed, anything writing plugin
// records from outside the hook (a file import, a cloud load) stayed invisible
// until a full page reload — the UI had no idea localStorage had moved.

const record = (id: string, enabled: boolean, userConfig: Record<string, unknown>): InstalledPluginRecord =>
  ({
    id,
    name: id,
    version: '1.0.0',
    enabled,
    installedAt: 1754006400000,
    userConfig,
    kind: 'core',
  }) as InstalledPluginRecord;

describe('installed-plugin store', () => {
  beforeEach(() => {
    window.localStorage.removeItem(PLUGINS_STORAGE_KEY);
  });

  it('round-trips records, config values included', () => {
    writeInstalledPlugins([record('combat-compression', true, { threshold: 3 })]);

    const read = readInstalledPlugins();
    expect(read).toHaveLength(1);
    expect(read[0].enabled).toBe(true);
    // The configured VALUES are the point — an enabled flag alone does not
    // carry a configured plugin between clients.
    expect(read[0].userConfig).toEqual({ threshold: 3 });
  });

  it('announces the write so mounted hooks can re-read', () => {
    const seen: string[] = [];
    const onUpdated = () => seen.push('fired');
    window.addEventListener(PLUGINS_UPDATED_EVENT, onUpdated);

    try {
      writeInstalledPlugins([record('text-to-speech', false, {})]);
      // Exactly this notification is what removes the reload requirement.
      expect(seen).toEqual(['fired']);
    } finally {
      window.removeEventListener(PLUGINS_UPDATED_EVENT, onUpdated);
    }
  });

  it('reads an empty list when nothing is stored, rather than throwing', () => {
    expect(readInstalledPlugins()).toEqual([]);
  });

  it('tolerates a corrupt store instead of taking the page down', () => {
    window.localStorage.setItem(PLUGINS_STORAGE_KEY, '{not json');
    expect(readInstalledPlugins()).toEqual([]);
  });
});

// SETTINGS-01 / SETTINGS-04: every route that writes the installed list ends up storing overrides only. Before this,
// pressing Save once stored a copy of ALL of a plugin's settings, so a default the plugin changed later never reached
// that user, and a cloud load or file import from an older client brought such a copy back in.
describe('installed-plugin store keeps overrides only', () => {
  const rollerDefaults = () => corePluginDefaults('roller') as Record<string, unknown>;
  const stored = () => JSON.parse(window.localStorage.getItem(PLUGINS_STORAGE_KEY) ?? '[]') as InstalledPluginRecord[];

  beforeEach(() => {
    window.localStorage.removeItem(PLUGINS_STORAGE_KEY);
  });

  it('stores nothing for a record that carries a full copy of the defaults (cloud load / file import shape)', () => {
    writeInstalledPlugins([record('roller', true, { ...rollerDefaults() })]);
    expect(readInstalledPlugins()[0].userConfig).toEqual({});
  });

  it('keeps only the edited setting from that old shape', () => {
    writeInstalledPlugins([record('roller', true, { ...rollerDefaults(), minStr: 12 })]);
    expect(readInstalledPlugins()[0].userConfig).toEqual({ minStr: 12 });
  });

  it('stores a record for a plugin with no known defaults exactly as given', () => {
    writeInstalledPlugins([record('not-a-core-plugin', true, { a: 1, b: 'x' })]);
    expect(readInstalledPlugins()[0].userConfig).toEqual({ a: 1, b: 'x' });
  });

  it('prunes without mutating the records it was given', () => {
    const config = Object.freeze({ ...rollerDefaults(), minStr: 12 });
    const frozen = Object.freeze([Object.freeze(record('roller', true, config))]) as unknown as InstalledPluginRecord[];

    writeInstalledPlugins(frozen);

    expect(readInstalledPlugins()[0].userConfig).toEqual({ minStr: 12 });
    expect(frozen[0].userConfig).toEqual({ ...rollerDefaults(), minStr: 12 });
  });

  it('hook route: updatePluginConfig stores the edit, drops it again when set back to the default', () => {
    writeInstalledPlugins([record('roller', true, {})]);
    const { result } = renderHook(() => usePlugins());

    act(() => result.current.updatePluginConfig('roller', { ...rollerDefaults() }));
    expect(stored()[0].userConfig).toEqual({});

    act(() => result.current.updatePluginConfig('roller', { ...rollerDefaults(), minStr: 12 }));
    expect(stored()[0].userConfig).toEqual({ minStr: 12 });

    act(() => result.current.updatePluginConfig('roller', { ...rollerDefaults(), minStr: rollerDefaults().minStr }));
    expect(stored()[0].userConfig).toEqual({});
  });

  it('plugin self-patch route: a patch equal to the default stays out of storage (as MainContainer merges it)', () => {
    writeInstalledPlugins([record('roller', true, { minStr: 12 })]);
    const { result } = renderHook(() => usePlugins());
    const current = result.current.getInstallRecord('roller')?.userConfig ?? {};

    act(() => result.current.updatePluginConfig('roller', { ...current, totalTarget: rollerDefaults().totalTarget }));

    expect(stored()[0].userConfig).toEqual({ minStr: 12 });
  });

  it('hook route for a plugin with no known defaults: keeps the values, drops undefined', () => {
    writeInstalledPlugins([record('not-a-core-plugin', true, {})]);
    const { result } = renderHook(() => usePlugins());

    act(() => result.current.updatePluginConfig('not-a-core-plugin' as never, { a: 1, b: undefined }));

    expect(stored()[0].userConfig).toEqual({ a: 1 });
  });

  it('Crafting Helper (E4): its full default tables store nothing, an old differing table is kept', () => {
    const defaults = corePluginDefaults('crafting-helper') as Record<string, unknown>;
    writeInstalledPlugins([record('crafting-helper', true, { ...defaults })]);
    expect(readInstalledPlugins()[0].userConfig).toEqual({});

    const oldTable = [...(defaults.tierTable as string[]), 'spellcrafting | 999 | an old row | something:1'];
    writeInstalledPlugins([record('crafting-helper', true, { ...defaults, tierTable: oldTable })]);
    expect(readInstalledPlugins()[0].userConfig).toEqual({ tierTable: oldTable });
  });
});

// The original report, end to end: someone opened Configure, pressed Save without changing anything, and the plugin
// later shipped a corrected default.
describe('a changed plugin default reaches users who did not override it', () => {
  const rollerDefaults = () => corePluginDefaults('roller') as Record<string, unknown>;

  function rollerProbe(defaults: Record<string, unknown>) {
    let api: PluginRuntimeApi | null = null;
    const module = {
      manifest: { id: 'roller', name: 'roller', version: '1.0.0' },
      configSchema: { defaults, fields: [] },
      onEnable(a: PluginRuntimeApi) {
        api = a;
        return () => {};
      },
    } as unknown as IPluginModule;
    return { module, config: () => api?.getConfig() };
  }

  function runWithNewDefaults(userConfig: Record<string, unknown>) {
    const probe = rollerProbe({ ...rollerDefaults(), totalTarget: 300, minStr: 7 });
    const host = new PluginHost();
    host.setConnection('dsl-mud');
    host.registerModule(probe.module);
    host.syncInstalled([{ id: 'roller', enabled: true, userConfig }]);
    return probe.config();
  }

  beforeEach(() => {
    window.localStorage.removeItem(PLUGINS_STORAGE_KEY);
  });

  it('applies the new default to a setting the user never changed', () => {
    writeInstalledPlugins([record('roller', true, { ...rollerDefaults() })]);

    const config = runWithNewDefaults(readInstalledPlugins()[0].userConfig);

    expect(config?.totalTarget).toBe(300);
    expect(config?.minStr).toBe(7);
  });

  it("keeps the user's own value for a setting they did change", () => {
    writeInstalledPlugins([record('roller', true, { ...rollerDefaults(), minStr: 12 })]);

    const config = runWithNewDefaults(readInstalledPlugins()[0].userConfig);

    expect(config?.minStr).toBe(12);
    expect(config?.totalTarget).toBe(300);
  });
});

// SETTINGS-05: the one-time prune of configs saved before the store kept overrides only.
describe('first-load prune of already-frozen configs', () => {
  const rollerDefaults = () => corePluginDefaults('roller') as Record<string, unknown>;
  const craftDefaults = () => corePluginDefaults('crafting-helper') as Record<string, unknown>;
  const stored = () => JSON.parse(window.localStorage.getItem(PLUGINS_STORAGE_KEY) ?? '[]') as InstalledPluginRecord[];
  const seed = (records: InstalledPluginRecord[]) =>
    window.localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(records));

  beforeEach(() => {
    window.localStorage.removeItem(PLUGINS_STORAGE_KEY);
    window.localStorage.removeItem(OVERRIDES_MIGRATED_KEY);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prunes every known plugin once, keeps edits and unknown plugins, and sets the marker', () => {
    seed([
      record('roller', true, { ...rollerDefaults(), minStr: 12 }),
      record('crafting-helper', false, { ...craftDefaults() }),
      record('not-a-core-plugin', true, { q: 1 }),
    ]);

    migratePluginConfigOverrides();

    expect(stored().map((r) => r.userConfig)).toEqual([{ minStr: 12 }, {}, { q: 1 }]);
    expect(window.localStorage.getItem(OVERRIDES_MIGRATED_KEY)).toBe('1');
  });

  it('does not run again once the marker is set (no write at all)', () => {
    seed([record('roller', true, { ...rollerDefaults() })]);
    migratePluginConfigOverrides();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    migratePluginConfigOverrides();

    expect(setItem).not.toHaveBeenCalled();
  });

  it('writes only the marker when there is nothing to prune', () => {
    seed([record('roller', true, { minStr: 12 })]);
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    migratePluginConfigOverrides();

    expect(setItem.mock.calls.map((call) => call[0])).toEqual([OVERRIDES_MIGRATED_KEY]);
  });

  it('leaves the data alone and keeps running when the prune cannot be written; warns once without echoing any setting', () => {
    seed([record('roller', true, { ...rollerDefaults(), minStr: 12, note: 'SECRET-VALUE-123' })]);
    const before = window.localStorage.getItem(PLUGINS_STORAGE_KEY);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => migratePluginConfigOverrides()).not.toThrow();

    expect(window.localStorage.getItem(PLUGINS_STORAGE_KEY)).toBe(before);
    expect(window.localStorage.getItem(OVERRIDES_MIGRATED_KEY)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('SECRET-VALUE-123');
  });

  it('survives storage that cannot even be read, warns once, and retries next start (no marker)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => migratePluginConfigOverrides()).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
    expect(window.localStorage.getItem(OVERRIDES_MIGRATED_KEY)).toBeNull();
  });
});
