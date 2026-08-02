import { DispatchEvent } from '../event-emitter/event-dispatcher';

/**
 * Lets a running plugin persist a config change it made itself.
 *
 * `api.updateConfig` is in-memory only, and `pluginHost.syncInstalled` re-applies
 * `{ ...defaults, ...userConfig }` over the runtime config on every installed-list
 * change — so a plugin that changes its own setting (a floating toggle button, say)
 * has it silently reverted the next time any unrelated plugin is touched, and always
 * on reload. Persisting means routing the change to the same store the config modal
 * writes, which lives in a React hook the plugin cannot reach.
 *
 * Hence this event: the plugin announces the patch, MainContainer applies it via
 * usePlugins().updatePluginConfig. A PATCH, not the whole config — the plugin's
 * runtime config is defaults+saved merged together, so writing it back wholesale
 * would promote every default into an explicit saved value and freeze it there.
 */
export const PLUGIN_CONFIG_PERSIST_EVENT = 'shatteredarchive:plugin-config-persist';

export interface PluginConfigPersistPayload {
  pluginId: string;
  patch: Record<string, unknown>;
}

export function persistPluginConfigPatch(pluginId: string, patch: Record<string, unknown>): void {
  DispatchEvent(PLUGIN_CONFIG_PERSIST_EVENT, { pluginId, patch } satisfies PluginConfigPersistPayload);
}
