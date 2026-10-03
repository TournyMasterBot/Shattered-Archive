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
});
