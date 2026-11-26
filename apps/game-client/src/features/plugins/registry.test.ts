import { CORE_PLUGINS, findCorePlugin } from './registry';

describe('core plugin registry', () => {
  it('registers Auto Group, and finds it by its id', () => {
    const def = findCorePlugin('auto-group');
    expect(def).toBeDefined();
    expect(def?.id).toBe('auto-group');
    expect(def?.manifest.name).toBe('Auto Group');
  });

  it('builds a working Auto Group module whose manifest matches the registered one', () => {
    const def = findCorePlugin('auto-group')!;
    const mod = def.create();
    expect(mod.manifest).toEqual(def.manifest);
    expect(typeof mod.onEnable).toBe('function');
    // the config UI renders from this schema: every field needs a default
    expect(Object.keys(mod.configSchema!.defaults!).sort()).toEqual(mod.configSchema!.fields.map((f) => f.key).sort());
  });

  it('keeps every registered id unique and equal to its own manifest id', () => {
    const ids = CORE_PLUGINS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CORE_PLUGINS) expect(p.manifest.id).toBe(p.id);
  });

  it('returns undefined for an id that is not registered', () => {
    expect(findCorePlugin('no-such-plugin')).toBeUndefined();
  });
});
