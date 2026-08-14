import {
  PLUGINS_STORAGE_KEY,
  PLUGINS_UPDATED_EVENT,
  readInstalledPlugins,
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
