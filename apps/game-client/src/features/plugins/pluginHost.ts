// apps/game-client/src/features/plugins/pluginHost.ts
import type { IPluginModule, PluginId, PluginRuntimeApi } from '@shatteredarchive/types-client';

import { applyPluginBaseCss, removePluginBaseCss } from './pluginCss';
import { startPluginBundledScripts } from './pluginScriptRunner';
import { normalizePluginModule } from './normalizePluginModule';
import { ROUTED_WINDOW_EVENTS } from './routed-gmcp-events';
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { setPluginOmitRules } from '../userScripts/triggerOmitStore';
import { renderDslToAnsi } from '../userScripts/dslToAnsi';

type PluginCleanup = {
  api?: PluginRuntimeApi;
  stopScripts?: () => void;
  removeBaseCss?: () => void;
  onDisable?: () => void;
  aliasHandlers?: Array<{ alias: string; run: (inputText: string) => void }>;
  offEvents?: Array<() => void>;
  actionHandlers?: Map<string, () => void>;
};

type HostState = {
  connectionId: string;
  enabled: Set<PluginId>;
  modules: Map<PluginId, IPluginModule>;
  cleanups: Map<PluginId, PluginCleanup>;
};

function makeDefaultApi(
  connectionId: string,
  pluginId: PluginId,
  module: IPluginModule,
  actionHandlers: Map<string, () => void>,
): PluginRuntimeApi {
  const onEvent: PluginRuntimeApi['onEvent'] = (eventName, handler) => {
    // Build a stable, HMR-safe dedupe key for this subscription.
    // If the same plugin registers the same event multiple times (or via HMR),
    // the dispatcher registry will replace the old listener automatically.
    const key = `pluginRuntimeApi::onEvent::${pluginId}::${String(eventName)}`;

    // ListenEvent hands us the CustomEvent.detail already
    const dispose = ListenEvent<any>(
      eventName,
      (payload) => {
        handler(payload);
      },
      { key },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
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
      DispatchEvent('shatteredarchive:write-terminal', {
        rawText: text,
        // TODO : Consider cleaning this text output -- but don't remove it
        // as would be a breaking change.
        text: text,
        kind,
        fromUserScript: true,
        fromPlugin: true,
      });
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
      DispatchEvent('shatteredarchive:send-command', { cmd, connectionId });
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

    writeTerminal: (dslText: string) => {
      try {
        const ansi = renderDslToAnsi(dslText);
        DispatchEvent('shatteredarchive:write-terminal', {
          rawText: ansi,
          text: ansi,
          fromUserScript: true,
          fromPlugin: true,
        });
      } catch {
        // ignore
      }
    },

    registerOmitRules: (rules: Array<{ matchText: string; eventName?: string; caseInsensitive?: boolean }>) => {
      setPluginOmitRules(pluginId, rules);
    },

    registerAction: (key: string, handler: () => void) => {
      actionHandlers.set(key, handler);
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

    const actionHandlers = new Map<string, () => void>();
    const apiBase = makeDefaultApi(s.connectionId, pluginId, mod, actionHandlers);

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
      actionHandlers,
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

    setPluginOmitRules(pluginId, []);
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
   * Called from the alias pipeline when no user-script alias matched.
   * Gives enabled plugins a chance to consume the command via onAlias.
   * Returns true if a plugin consumed the command (should not be sent to game).
   */
  tryExecuteAlias(input: string): boolean {
    if (!this.state) return false;

    for (const [pluginId, cleanup] of this.state.cleanups.entries()) {
      const mod = this.state.modules.get(pluginId);
      if (!mod?.onAlias || !cleanup.api) continue;

      try {
        if (mod.onAlias(cleanup.api, input)) return true;
      } catch (err) {
        cleanup.api.error('onAlias error', err);
      }
    }

    return false;
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

  /**
   * Invoke a named action registered by an enabled plugin.
   * Called from the configure modal action buttons.
   */
  invokePluginAction(pluginId: PluginId, actionKey: string): void {
    if (!this.state) return;
    const c = this.state.cleanups.get(pluginId);
    const handler = c?.actionHandlers?.get(actionKey);
    if (handler) {
      try {
        handler();
      } catch (err) {
        c?.api?.error('Action error', err);
      }
    }
  }
}

export const pluginHost = new PluginHost();
