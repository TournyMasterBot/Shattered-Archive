import { extractGlobalsItem, extractPluginConfigsItem, isValidUserScript, tryParseExportFile } from './exportFormat';

// Cross-client contract tests. The file below is REAL mobile output — the exact
// shape shatteredarchive-mobile's buildExportFile() writes, foreign `storage`
// ('asyncStorage') and foreign `key` included. If the mobile client changes its
// envelope without this repo following, these fail.
//
// This is the direction that used to be completely broken: the web importer
// required `key` to equal the CURRENT connection's storage key, so no mobile
// file could ever import here.

const MOBILE_EXPORT = JSON.stringify({
  schema: 'shatteredArchive.export.v1',
  exportedAt: '2026-08-01T12:00:00.000Z',
  app: 'shatteredArchive.mobile',
  items: [
    {
      storage: 'asyncStorage',
      key: 'scripts:user-scripts',
      format: 'json',
      kind: 'userScripts',
      value: [
        {
          id: 'a1',
          kind: 'alias',
          name: 'Kick',
          enabled: true,
          language: 'text',
          source: 'kick',
          alias: 'k',
        },
        {
          id: 't1',
          kind: 'trigger',
          name: 'Flee',
          enabled: true,
          language: 'lua',
          source: 'sendCommand("flee")',
          matchText: 'You are bleeding',
          eventName: 'shatteredarchive:raw-data',
        },
        {
          id: 'm1',
          kind: 'timer',
          name: 'Tick',
          enabled: false,
          language: 'python',
          source: 'sendCommand("look")',
          intervalMs: 5000,
        },
      ],
    },
    {
      storage: 'asyncStorage',
      key: 'scripts:global-scripts',
      format: 'json',
      kind: 'globalScripts',
      value: {
        javascript: '',
        typescript: '',
        lua: 'function heal(a) sendCommand("quaff heal") end',
        python: '',
      },
    },
    {
      storage: 'asyncStorage',
      key: 'plugin-config',
      format: 'json',
      kind: 'pluginConfigs',
      value: [
        {
          id: 'combat-compression',
          name: 'Combat Compression',
          version: '1.0.0',
          enabled: true,
          installedAt: 1754006400000,
          userConfig: { collapseRounds: true, threshold: 3 },
          kind: 'core',
        },
      ],
    },
  ],
});

describe('importing a mobile-written file', () => {
  it('parses despite a foreign storage type and key', () => {
    const parsed = tryParseExportFile(MOBILE_EXPORT);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.items).toHaveLength(1); // only the userScripts item
    expect(parsed.file.items[0].value).toHaveLength(3);
    expect(parsed.file.app).toBe('shatteredArchive.mobile');
  });

  it('keeps scripts in every language, including the mobile-authored ones', () => {
    const parsed = tryParseExportFile(MOBILE_EXPORT);
    if (!parsed.ok) throw new Error('expected parse to succeed');

    expect(parsed.file.items[0].value.map((s) => s.language).sort()).toEqual(['lua', 'python', 'text']);
  });

  it('recovers the global scripts that travelled with it', () => {
    expect(extractGlobalsItem(MOBILE_EXPORT)?.lua).toContain('function heal');
  });

  it('recovers plugin configuration, values intact', () => {
    const plugins = extractPluginConfigsItem(MOBILE_EXPORT);

    expect(plugins).toHaveLength(1);
    expect(plugins![0].id).toBe('combat-compression');
    expect(plugins![0].enabled).toBe(true);
    expect(plugins![0].userConfig).toEqual({ collapseRounds: true, threshold: 3 });
  });
});

describe('format guards', () => {
  it('treats a file with no globals/plugins item as "leave mine alone"', () => {
    // null, not {} — a pre-sharing export must not wipe local globals/plugins.
    const scriptsOnly = JSON.stringify({
      schema: 'shatteredArchive.export.v1',
      exportedAt: '2026-08-01T12:00:00.000Z',
      items: [{ storage: 'localStorage', key: 'k', format: 'json', kind: 'userScripts', value: [] }],
    });

    expect(extractGlobalsItem(scriptsOnly)).toBeNull();
    expect(extractPluginConfigsItem(scriptsOnly)).toBeNull();
  });

  it('rejects a foreign schema rather than half-importing it', () => {
    const wrong = JSON.stringify({ schema: 'something.else', items: [] });
    const parsed = tryParseExportFile(wrong);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('schema');
  });

  it('reports malformed JSON instead of throwing', () => {
    expect(tryParseExportFile('not json').ok).toBe(false);
  });

  it('drops malformed plugin records but keeps the valid ones', () => {
    const mixed = JSON.stringify({
      schema: 'shatteredArchive.export.v1',
      exportedAt: '2026-08-01T12:00:00.000Z',
      items: [
        {
          storage: 'localStorage',
          key: 'k',
          format: 'json',
          kind: 'pluginConfigs',
          value: [
            { id: 'ok', name: 'Ok', version: '1.0.0', enabled: true, installedAt: 1, userConfig: {}, kind: 'core' },
            { id: 'no-version', name: 'x', enabled: true, installedAt: 1 },
            null,
          ],
        },
      ],
    });

    expect(extractPluginConfigsItem(mixed)!.map((r) => r.id)).toEqual(['ok']);
  });

  it('validates scripts structurally, tolerating unknown future fields', () => {
    expect(
      isValidUserScript({
        id: 'x',
        name: 'x',
        enabled: true,
        language: 'javascript',
        source: '',
        kind: 'alias',
        alias: 'a',
        someFutureField: 42,
      }),
    ).toBe(true);

    expect(isValidUserScript({ id: '', name: 'x', enabled: true, language: 'text', source: '', kind: 'alias', alias: 'a' })).toBe(
      false,
    );
    expect(isValidUserScript(null)).toBe(false);
  });
});
