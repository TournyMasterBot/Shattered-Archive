import { CORE_PLUGINS } from './registry';
import { corePluginDefaults, isSameAsDefault, pruneRecordOverrides, toOverrides } from './pluginConfigOverrides';

// Saving a plugin's settings must store only what differs from the plugin's defaults, so a changed default still
// reaches a user who never changed that setting. These tests pin what "differs" means.

describe('isSameAsDefault (SETTINGS-02: strict structural equality)', () => {
  it('treats identical primitives as the same, and a string as different from the number it spells', () => {
    expect(isSameAsDefault(5, 5)).toBe(true);
    expect(isSameAsDefault('a', 'a')).toBe(true);
    expect(isSameAsDefault('5', 5)).toBe(false);
    expect(isSameAsDefault(0, false)).toBe(false);
    expect(isSameAsDefault('', null)).toBe(false);
  });

  it('distinguishes null from undefined', () => {
    expect(isSameAsDefault(null, null)).toBe(true);
    expect(isSameAsDefault(null, undefined)).toBe(false);
    expect(isSameAsDefault(undefined, null)).toBe(false);
  });

  it('compares objects by key set regardless of key order', () => {
    expect(isSameAsDefault({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isSameAsDefault({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isSameAsDefault({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    expect(isSameAsDefault({ a: undefined }, {})).toBe(false);
  });

  it('compares arrays by position and length', () => {
    expect(isSameAsDefault([1, 2], [1, 2])).toBe(true);
    expect(isSameAsDefault([1, 2], [2, 1])).toBe(false);
    expect(isSameAsDefault([1, 2], [1, 2, 3])).toBe(false);
  });

  it('never equates an array with an object or a primitive', () => {
    expect(isSameAsDefault([], {})).toBe(false);
    expect(isSameAsDefault({}, [])).toBe(false);
    expect(isSameAsDefault([1], 1)).toBe(false);
  });

  it('compares nested tables cell by cell', () => {
    const table = [
      { tier: 1, name: 'a', flags: ['x', 'y'] },
      { tier: 2, name: 'b', flags: [] },
    ];
    const same = [
      { name: 'a', tier: 1, flags: ['x', 'y'] },
      { name: 'b', flags: [], tier: 2 },
    ];
    const oneCellDifferent = [
      { tier: 1, name: 'a', flags: ['x', 'y'] },
      { tier: 2, name: 'B', flags: [] },
    ];
    expect(isSameAsDefault(same, table)).toBe(true);
    expect(isSameAsDefault(oneCellDifferent, table)).toBe(false);
  });
});

describe('toOverrides (SETTINGS-01: store only what differs)', () => {
  const defaults = { enabled: true, delay: 3, words: ['a', 'b'], label: null as string | null };

  it('stores nothing when the config is just the defaults', () => {
    expect(toOverrides({ ...defaults }, defaults)).toEqual({});
  });

  it('keeps only the edited key', () => {
    expect(toOverrides({ ...defaults, delay: 9 }, defaults)).toEqual({ delay: 9 });
  });

  it('drops a key edited back to its default', () => {
    const edited = toOverrides({ ...defaults, delay: 9 }, defaults);
    expect(toOverrides({ ...defaults, ...edited, delay: 3 }, defaults)).toEqual({});
  });

  it('keeps a key that has no default entry (an optional field)', () => {
    expect(toOverrides({ ...defaults, note: 'hi' }, defaults)).toEqual({ note: 'hi' });
  });

  it('drops undefined values but keeps null unless the default is null as well', () => {
    expect(toOverrides({ delay: undefined }, defaults)).toEqual({});
    expect(toOverrides({ delay: null }, defaults)).toEqual({ delay: null });
    expect(toOverrides({ label: null }, defaults)).toEqual({});
  });

  it('keeps a value that only looks like the default through a different type', () => {
    expect(toOverrides({ delay: '3' }, defaults)).toEqual({ delay: '3' });
  });

  it('returns a new object and leaves a frozen input untouched', () => {
    const input = Object.freeze({ ...defaults, delay: 9 });
    const out = toOverrides(input, defaults);
    expect(out).not.toBe(input);
    expect(input).toEqual({ ...defaults, delay: 9 });
    expect(out).toEqual({ delay: 9 });
  });
});

describe('pruneRecordOverrides', () => {
  type Rec = { id: string; enabled: boolean; userConfig: Record<string, unknown> };
  const defaultsById: Record<string, Record<string, unknown>> = { known: { a: 1, b: 2 } };
  const defaultsFor = (id: string) => defaultsById[id];

  it('leaves a record for a plugin with no known defaults exactly as stored', () => {
    const rec: Rec = { id: 'mystery', enabled: true, userConfig: { a: 1, b: undefined } };
    const out = pruneRecordOverrides([rec], defaultsFor);
    expect(out.changed).toBe(false);
    expect(out.records[0]).toBe(rec);
  });

  it('returns the same array and changed:false when nothing is dropped', () => {
    const records: Rec[] = [
      { id: 'known', enabled: true, userConfig: { a: 5 } },
      { id: 'known2', enabled: false, userConfig: {} },
    ];
    const out = pruneRecordOverrides(records, defaultsFor);
    expect(out.changed).toBe(false);
    expect(out.records).toBe(records);
  });

  it('replaces only the affected records and reports a change', () => {
    const frozen: Rec = { id: 'known', enabled: true, userConfig: { a: 1, b: 2 } };
    const untouched: Rec = { id: 'mystery', enabled: false, userConfig: { z: 1 } };
    const out = pruneRecordOverrides([frozen, untouched], defaultsFor);
    expect(out.changed).toBe(true);
    expect(out.records[0]).toEqual({ id: 'known', enabled: true, userConfig: {} });
    expect(out.records[1]).toBe(untouched);
    expect(frozen.userConfig).toEqual({ a: 1, b: 2 });
  });

  it('keeps a record whose userConfig is missing instead of throwing', () => {
    const rec = { id: 'known', enabled: true } as unknown as Rec;
    const out = pruneRecordOverrides([rec], defaultsFor);
    expect(out.changed).toBe(false);
    expect(out.records[0]).toBe(rec);
  });
});

describe('corePluginDefaults', () => {
  it('returns the defaults a core plugin declares, the same object on every call', () => {
    const defaults = corePluginDefaults('roller');
    expect(defaults).toBeDefined();
    expect(corePluginDefaults('roller')).toBe(defaults);
  });

  it('returns undefined for an id that is not a core plugin', () => {
    expect(corePluginDefaults('no-such-plugin')).toBeUndefined();
  });
});

describe('every core plugin (E4)', () => {
  const withDefaults = CORE_PLUGINS.flatMap((def) => {
    const defaults = def.create().configSchema?.defaults;
    return defaults ? [{ id: def.id, defaults }] : [];
  });

  it('declares defaults for most plugins, so this guard covers real data', () => {
    expect(withDefaults.length).toBeGreaterThan(10);
  });

  it.each(withDefaults.map((p) => [p.id, p.defaults] as const))(
    '%s: saving its own defaults stores nothing',
    (_id, defaults) => {
      expect(toOverrides({ ...defaults }, defaults)).toEqual({});
    },
  );

  it('includes Crafting Helper, whose large default tables are what froze before', () => {
    const crafting = withDefaults.find((p) => p.id === 'crafting-helper');
    expect(crafting && Object.keys(crafting.defaults)).toEqual(expect.arrayContaining(['tierTable', 'craftTypes']));
  });
});
