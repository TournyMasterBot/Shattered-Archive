import { normalizePluginModule } from './normalizePluginModule';
import type { IPluginModule } from '@shatteredarchive/types-client';

function baseModule(overrides: Partial<IPluginModule> = {}): IPluginModule {
  return {
    manifest: { id: 'test', name: 'Test', version: '1.0.0' },
    configSchema: { defaults: {}, fields: [] },
    onEnable: () => () => {},
    ...overrides,
  } as IPluginModule;
}

describe('normalizePluginModule', () => {
  it('passes through a valid actions array unchanged', () => {
    const actions = [{ key: 'sync', label: 'Sync' }];
    const mod = baseModule({ configSchema: { defaults: {}, fields: [], actions } as any });
    expect(normalizePluginModule(mod).configSchema?.actions).toEqual(actions);
  });

  it('drops a non-array actions value to undefined', () => {
    const mod = baseModule({ configSchema: { defaults: {}, fields: [], actions: 'not-an-array' } as any });
    expect(normalizePluginModule(mod).configSchema?.actions).toBeUndefined();
  });

  it('leaves actions undefined when the field is absent', () => {
    const mod = baseModule();
    expect(normalizePluginModule(mod).configSchema?.actions).toBeUndefined();
  });

  it('still passes through onAlias (the fix this file originally shipped for)', () => {
    const onAlias = () => true;
    const mod = baseModule({ onAlias });
    expect(normalizePluginModule(mod).onAlias).toBe(onAlias);
  });

  // HOST-1: the field-by-field copy dropped any hook it did not list, and that is how every plugin's
  // onAlias went dead. These pin the root cause, not just the one field.
  it('passes every lifecycle / command hook through by reference', () => {
    const hooks = {
      onEnable: () => () => {},
      onDisable: () => {},
      onEvent: () => {},
      onAlias: () => true,
      exportPlugin: () => ({}),
    };
    const out = normalizePluginModule(baseModule(hooks as unknown as Partial<IPluginModule>)) as unknown as Record<
      string,
      unknown
    >;
    for (const [name, fn] of Object.entries(hooks)) expect(out[name]).toBe(fn);
  });

  it('does not drop a hook it has never heard of (a future IPluginModule field)', () => {
    const onFutureHook = () => 'x';
    const mod = baseModule({ onFutureHook } as unknown as Partial<IPluginModule>);
    expect((normalizePluginModule(mod) as unknown as Record<string, unknown>).onFutureHook).toBe(onFutureHook);
  });

  it('still normalizes manifest, assets and configSchema around the passthrough', () => {
    const out = normalizePluginModule(
      baseModule({
        manifest: { id: 7, name: 'N', version: '2.0.0', supportsExport: 'yes' } as unknown as IPluginModule['manifest'],
        assets: { css: '', scripts: 'nope' } as unknown as IPluginModule['assets'],
        configSchema: { defaults: 'bad', fields: 'bad' } as unknown as IPluginModule['configSchema'],
      }),
    );
    expect(out.manifest).toMatchObject({ id: '', name: 'N', version: '2.0.0', supportsExport: false });
    expect(out.assets).toEqual({ css: undefined, scripts: undefined });
    expect(out.configSchema).toMatchObject({ defaults: undefined, fields: [] });
  });
});
