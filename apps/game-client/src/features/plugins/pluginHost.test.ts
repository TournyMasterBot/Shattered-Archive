import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

import { PluginHost } from './pluginHost';

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
