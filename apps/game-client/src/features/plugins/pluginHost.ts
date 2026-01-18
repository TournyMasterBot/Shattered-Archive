// apps/game-client/src/features/plugins/pluginHost.ts
import type { IPluginModule, PluginId, PluginRuntimeApi } from '@shatteredarchive/types-client';

import { applyPluginBaseCss, removePluginBaseCss } from './pluginCss';
import { startPluginBundledScripts } from './pluginScriptRunner';
import { normalizePluginModule } from './normalizePluginModule';
import { ROUTED_WINDOW_EVENTS } from './routed-gmcp-events';
import { DispatchEvent } from '../event-emitter/event-dispatcher';

type PluginCleanup = {
  api?: PluginRuntimeApi;
  stopScripts?: () => void;
  removeBaseCss?: () => void;
  onDisable?: () => void;
  aliasHandlers?: Array<{ alias: string; run: (inputText: string) => void }>;
  offEvents?: Array<() => void>;
};

type HostState = {
  connectionId: string;
  enabled: Set<PluginId>;
  modules: Map<PluginId, IPluginModule>;
  cleanups: Map<PluginId, PluginCleanup>;
};

function makeDefaultApi(connectionId: string, pluginId: PluginId, module: IPluginModule): PluginRuntimeApi {
  const onEvent: PluginRuntimeApi['onEvent'] = (eventName, handler) => {
    const fn = (ev: Event) => {
      const ce = ev as CustomEvent;
      handler((ce as any)?.detail);
    };

    window.addEventListener(eventName, fn as EventListener);
    return () => window.removeEventListener(eventName, fn as EventListener);
  };

  const httpGetJson: PluginRuntimeApi['httpGetJson'] = async (url, options) => {
    const init: RequestInit = {
      method: options?.method ?? 'GET',
      headers: options?.headers ? { ...options.headers } : undefined,
    };

    if (options?.body !== undefined) {
      if (!init.headers) init.headers = {};
      if (!('Content-Type' in init.headers)) {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const res = await fetch(url, init);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ''} – ${text.slice(0, 200)}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  // runtime config lives in-memory (host is source of truth for enabled plugin runtime)
  const defaults = module.configSchema?.defaults ?? {};
  const baseConfig: Record<string, unknown> = { ...defaults };

  const getConfig = () => ({ ...baseConfig });

  const setConfig = (next: Record<string, unknown>) => {
    for (const k of Object.keys(baseConfig)) delete baseConfig[k];
    Object.assign(baseConfig, next ?? {});
  };

  const updateConfig = (patch: Record<string, unknown>) => {
    Object.assign(baseConfig, patch ?? {});
  };

  const emitTerminalText = (text: string, kind: 'log' | 'error') => {
    try {
      window.dispatchEvent(
        new CustomEvent('game:terminal-data', {
          detail: {
            text,
            __fromPlugin: true,
            pluginId,
            kind,
          },
        }),
      );
    } catch {
      // ignore if window isn't available
    }
  };

  const toLine = (args: unknown[]) =>
    args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');

  return {
    connectionId,
    pluginId,

    sendCommand: (cmd: string) => {
      DispatchEvent('game:send-command', { cmd, connectionId });
    },

    log: (...args: unknown[]) => {
      console.log('[Plugin]', ...args);
      const msg = toLine(args);
      emitTerminalText(`\x1b[38;5;245m[plugin:${pluginId}]\x1b[0m ${msg}\r\n`, 'log');
    },

    error: (...args: unknown[]) => {
      console.error('[Plugin]', ...args);
      const msg = toLine(args);
      emitTerminalText(`\x1b[38;5;196m[plugin:${pluginId}]\x1b[0m ${msg}\r\n`, 'error');
    },

    onEvent,
    httpGetJson,

    getConfig,
    setConfig,
    updateConfig,
  };
}

export class PluginHost {
  private state: HostState | null = null;

  setConnection(connectionId: string) {
    const next = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
    if (this.state && this.state.connectionId === next) return;

    this.shutdown();
    this.state = {
      connectionId: next,
      enabled: new Set(),
      modules: new Map(),
      cleanups: new Map(),
    };
  }

  getConnectionId(): string {
    return this.state?.connectionId ?? 'default';
  }

  registerModule(module: IPluginModule) {
    if (!this.state) this.setConnection('default');
    this.state!.modules.set(module.manifest.id, module);
  }

  // PluginsPage / UI usage
  getRegisteredPlugins(): Array<{ id: PluginId; module: IPluginModule }> {
    if (!this.state) return [];
    return Array.from(this.state.modules.entries()).map(([id, module]) => ({ id, module }));
  }

  // Fetch a module by id
  getPluginModule(pluginId: PluginId): IPluginModule | undefined {
    return this.state?.modules.get(pluginId);
  }

  isEnabled(pluginId: PluginId): boolean {
    return !!this.state?.enabled.has(pluginId);
  }

  /**
   * Enable plugin and optionally hydrate its runtime config from stored userConfig.
   * userConfig should be the per-connection saved config (from InstalledPlugin.userConfig).
   */
  enable(pluginId: PluginId, userConfig?: Record<string, unknown>) {
    if (!this.state) return;

    const s = this.state;
    if (s.enabled.has(pluginId)) return;

    const raw = s.modules.get(pluginId);
    if (!raw) return;

    const mod = normalizePluginModule(raw);

    const apiBase = makeDefaultApi(s.connectionId, pluginId, mod);

    const api: PluginRuntimeApi = {
      ...apiBase,
      log: (...args) => apiBase.log(`[${mod.manifest.id}]`, ...args),
      error: (...args) => apiBase.error(`[${mod.manifest.id}]`, ...args),
    };

    // hydrate config: defaults + stored userConfig
    const defaults = mod.configSchema?.defaults ?? {};
    api.setConfig({ ...defaults, ...(userConfig ?? {}) });

    if (mod.assets?.css && mod.assets.css.trim()) {
      applyPluginBaseCss(s.connectionId, pluginId, mod.assets.css);
    }

    const scriptBundle = startPluginBundledScripts(pluginId, mod.assets?.scripts ?? [], api);

    let onEnableCleanup: void | (() => void);
    if (mod.onEnable) {
      onEnableCleanup = mod.onEnable(api);
    }

    const offEvents: Array<() => void> = [];
    if (mod.onEvent) {
      for (const eventName of ROUTED_WINDOW_EVENTS) {
        const off = api.onEvent(eventName, (payload) => {
          try {
            mod.onEvent?.(api, { name: eventName, payload });
          } catch (err) {
            api.error('Plugin onEvent error', err);
          }
        });
        offEvents.push(off);
      }
    }

    s.enabled.add(pluginId);
    s.cleanups.set(pluginId, {
      api,
      stopScripts: scriptBundle.stop,
      removeBaseCss: () => removePluginBaseCss(s.connectionId, pluginId),
      offEvents,
      onDisable: () => {
        if (typeof onEnableCleanup === 'function') onEnableCleanup();
        if (mod.onDisable) mod.onDisable(api);
      },
      aliasHandlers: scriptBundle.getAliasScripts(),
    });
  }

  disable(pluginId: PluginId) {
    if (!this.state) return;

    const s = this.state;
    if (!s.enabled.has(pluginId)) return;

    const c = s.cleanups.get(pluginId);
    if (c?.stopScripts) c.stopScripts();
    if (c?.offEvents) for (const off of c.offEvents) off();
    if (c?.onDisable) c.onDisable();
    if (c?.removeBaseCss) c.removeBaseCss();

    s.cleanups.delete(pluginId);
    s.enabled.delete(pluginId);
  }

  shutdown() {
    if (!this.state) return;
    const ids = Array.from(this.state.enabled.values());
    for (const id of ids) this.disable(id);
    this.state.modules.clear();
    this.state = null;
  }

  /**
   * Live update config for an enabled plugin (used by config UI).
   */
  updateEnabledPluginConfig(pluginId: PluginId, patch: Record<string, unknown>) {
    if (!this.state) return;
    const c = this.state.cleanups.get(pluginId);
    if (!c?.api) return;
    c.api.updateConfig(patch);
  }
}

export const pluginHost = new PluginHost();
