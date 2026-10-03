import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

import { PluginHost, pluginHost } from './pluginHost';
import { getHudWidget } from '../hudLayout/hudWidgetRegistry';

/**
 * Plugin modules are CLOSURES — `create()` mints fresh queues, timers and
 * subscriptions every call — so "was this plugin re-created?" is a correctness
 * question, not a performance one. text-to-speech buffers lines for ~300ms and
 * speaks on a ~150ms deferred timer whose disable path cancels everything in
 * flight, so a rebuild inside that window loses the line outright; sustained
 * rebuilds lose all of them and present as total silence with a healthy queue.
 *
 * These tests pin the two places that used to rebuild silently.
 */

type Probe = {
  module: IPluginModule;
  enableCount: number;
  disableCount: number;
  /** The api handed to the LIVE instance — its getConfig reads the running config. */
  api: PluginRuntimeApi | null;
};

function makeProbe(id: string): Probe {
  const probe: Probe = {
    enableCount: 0,
    disableCount: 0,
    api: null,
    module: {
      manifest: { id, name: id, version: '1.0.0' },
      configSchema: { defaults: { alpha: 'default-alpha', beta: 'default-beta' }, fields: [] },
      onEnable(api: PluginRuntimeApi) {
        probe.enableCount += 1;
        probe.api = api;
        return () => {
          probe.disableCount += 1;
        };
      },
    } as IPluginModule,
  };
  return probe;
}

describe('PluginHost.syncInstalled', () => {
  it('keeps the running instance when the installed list changes for unrelated reasons', () => {
    const host = new PluginHost();
    const tts = makeProbe('text-to-speech');
    const other = makeProbe('roller');

    host.setConnection('dsl-mud');
    host.registerModule(tts.module);
    host.registerModule(other.module);

    host.syncInstalled([
      { id: 'text-to-speech', enabled: true },
      { id: 'roller', enabled: false },
    ]);
    expect(tts.enableCount).toBe(1);

    // The exact churn that broke speech: another plugin is toggled, so the whole
    // installed array is rewritten and its identity changes. text-to-speech must
    // not notice.
    host.syncInstalled([
      { id: 'text-to-speech', enabled: true },
      { id: 'roller', enabled: true },
    ]);

    expect(tts.enableCount).toBe(1);
    expect(tts.disableCount).toBe(0);
    expect(other.enableCount).toBe(1);
  });

  it('re-registering a core plugin does not swap out the live instance', () => {
    const host = new PluginHost();
    const first = makeProbe('text-to-speech');

    host.setConnection('dsl-mud');
    host.registerModule(first.module);
    host.syncInstalled([{ id: 'text-to-speech', enabled: true }]);
    expect(first.enableCount).toBe(1);

    // Callers re-register the whole core set on every pass, each time with a
    // brand-new closure. Accepting it here left a dead module under the id while
    // the live listeners/timers belonged to the previous one.
    const second = makeProbe('text-to-speech');
    host.registerModule(second.module);

    expect(host.getPluginModule('text-to-speech')).toBe(first.module);
    expect(second.enableCount).toBe(0);
    expect(first.disableCount).toBe(0);
  });

  it('refreshes config on a running plugin instead of rebuilding it', () => {
    const host = new PluginHost();
    const tts = makeProbe('text-to-speech');

    host.setConnection('dsl-mud');
    host.registerModule(tts.module);
    host.syncInstalled([{ id: 'text-to-speech', enabled: true, userConfig: { alpha: 'one' } }]);
    host.syncInstalled([{ id: 'text-to-speech', enabled: true, userConfig: { alpha: 'two' } }]);

    expect(tts.enableCount).toBe(1);
    // Same merge enable() applies: schema defaults under the saved userConfig, so
    // a key dropped from userConfig falls back rather than going undefined.
    expect(tts.api?.getConfig()).toEqual({
      alpha: 'two',
      beta: 'default-beta',
    });
  });

  it('still disables a plugin that was turned off, and re-enabling builds a fresh instance', () => {
    const host = new PluginHost();
    const tts = makeProbe('text-to-speech');

    host.setConnection('dsl-mud');
    host.registerModule(tts.module);
    host.syncInstalled([{ id: 'text-to-speech', enabled: true }]);
    host.syncInstalled([{ id: 'text-to-speech', enabled: false }]);

    expect(tts.disableCount).toBe(1);

    host.syncInstalled([{ id: 'text-to-speech', enabled: true }]);
    expect(tts.enableCount).toBe(2);
  });
});

describe('PluginRuntimeApi.setHudWidget', () => {
  it('publishes into the widget registry, owned by the plugin id', () => {
    pluginHost.setConnection('test-conn');
    let capturedApi: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'test-plugin', name: 'Test', version: '1.0.0' },
      onEnable: (api) => {
        capturedApi = api;
      },
    } as IPluginModule);
    pluginHost.enable('test-plugin');

    capturedApi!.setHudWidget!('hud.rightColumn', { label: 'Enemy', value: 'A rabid wolf' });

    expect(getHudWidget('hud.rightColumn')).toEqual({
      ownerId: 'test-plugin',
      content: { label: 'Enemy', value: 'A rabid wolf' },
    });
  });

  it('clears every slot the plugin owns when the plugin is disabled', () => {
    pluginHost.setConnection('test-conn-2');
    let capturedApi: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'test-plugin-2', name: 'Test 2', version: '1.0.0' },
      onEnable: (api) => {
        capturedApi = api;
      },
    } as IPluginModule);
    pluginHost.enable('test-plugin-2');
    capturedApi!.setHudWidget!('hud.bottomStrip', { value: 'x' });
    expect(getHudWidget('hud.bottomStrip')).not.toBeNull();

    pluginHost.disable('test-plugin-2');
    expect(getHudWidget('hud.bottomStrip')).toBeNull();
  });

  it('disabling one plugin does not clear a slot owned by another plugin', () => {
    pluginHost.setConnection('test-conn-3');
    let apiA: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'plugin-a', name: 'A', version: '1.0.0' },
      onEnable: (api) => {
        apiA = api;
      },
    } as IPluginModule);
    pluginHost.registerModule({
      manifest: { id: 'plugin-b', name: 'B', version: '1.0.0' },
    } as IPluginModule);
    pluginHost.enable('plugin-a');
    pluginHost.enable('plugin-b');

    apiA!.setHudWidget!('hud.rightColumn', { value: 'from A' });
    pluginHost.disable('plugin-b'); // never touched this slot

    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'plugin-a', content: { value: 'from A' } });
  });
});

describe('PluginHost.tryExecuteAlias', () => {
  // Regression: normalizePluginModule's returned object omitted `onAlias`
  // entirely, so every enabled plugin's alias commands (brew's `brew <name>`,
  // questbot's `pq start`, etc.) were silently unreachable — tryExecuteAlias
  // reads onAlias off the normalized module stored at enable time, not the
  // raw one passed to registerModule.
  it('reaches an enabled plugin\'s onAlias and lets it consume a command', () => {
    const host = new PluginHost();
    let received: string | null = null;

    host.setConnection('alias-conn');
    host.registerModule({
      manifest: { id: 'alias-plugin', name: 'Alias Plugin', version: '1.0.0' },
      onAlias: (_api, input: string) => {
        if (input.trim().toLowerCase() !== 'ping') return undefined;
        received = input;
        return true;
      },
    } as IPluginModule);
    host.enable('alias-plugin');

    expect(host.tryExecuteAlias('ping')).toBe(true);
    expect(received).toBe('ping');
  });

  it('returns false, leaving the command unconsumed, when no enabled plugin matches', () => {
    const host = new PluginHost();
    host.setConnection('alias-conn-2');
    host.registerModule({
      manifest: { id: 'alias-plugin-2', name: 'Alias Plugin 2', version: '1.0.0' },
      onAlias: () => undefined,
    } as IPluginModule);
    host.enable('alias-plugin-2');

    expect(host.tryExecuteAlias('anything else')).toBe(false);
  });
});

describe('PluginHost.invokePluginAction', () => {
  it('returns "ok" and calls the handler when one is registered', () => {
    const host = new PluginHost();
    const handler = jest.fn();
    const module: IPluginModule = {
      manifest: { id: 'action-probe', name: 'Action Probe', version: '1.0.0' },
      configSchema: { defaults: {}, fields: [] },
      onEnable(api: PluginRuntimeApi) {
        api.registerAction('sync', handler);
        return () => {};
      },
    } as IPluginModule;

    host.setConnection('dsl-mud');
    host.registerModule(module);
    host.syncInstalled([{ id: 'action-probe', enabled: true }]);

    const result = host.invokePluginAction('action-probe', 'sync');

    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns "no-handler" and does not throw when no handler is registered for the key', () => {
    const host = new PluginHost();
    const module: IPluginModule = {
      manifest: { id: 'action-probe-2', name: 'Action Probe 2', version: '1.0.0' },
      configSchema: { defaults: {}, fields: [] },
      onEnable() {
        return () => {};
      },
    } as IPluginModule;

    host.setConnection('dsl-mud');
    host.registerModule(module);
    host.syncInstalled([{ id: 'action-probe-2', enabled: true }]);

    const result = host.invokePluginAction('action-probe-2', 'nonexistent-key');

    expect(result).toBe('no-handler');
  });

  it('returns "no-handler" when the plugin was never enabled', () => {
    const host = new PluginHost();
    expect(host.invokePluginAction('never-enabled', 'sync')).toBe('no-handler');
  });

  it('returns "error" (distinct from "no-handler") and does not throw when a registered handler throws', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const host = new PluginHost();
    const module: IPluginModule = {
      manifest: { id: 'action-probe-3', name: 'Action Probe 3', version: '1.0.0' },
      configSchema: { defaults: {}, fields: [] },
      onEnable(api: PluginRuntimeApi) {
        api.registerAction('sync', () => {
          throw new Error('boom');
        });
        return () => {};
      },
    } as IPluginModule;

    host.setConnection('dsl-mud');
    host.registerModule(module);
    host.syncInstalled([{ id: 'action-probe-3', enabled: true }]);

    const result = host.invokePluginAction('action-probe-3', 'sync');

    expect(result).toBe('error');
    expect(result).not.toBe('no-handler');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Plugin]', 'Action error', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });
});
