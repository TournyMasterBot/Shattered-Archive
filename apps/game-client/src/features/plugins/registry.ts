import type { IPluginModule, PluginId, PluginManifest } from '@shatteredarchive/types-client';
import { createRollerPlugin } from './core-plugins/roller.plugin';

export interface CorePluginDefinition {
  id: PluginId;
  manifest: PluginManifest;
  create: () => IPluginModule;
}

export const CORE_PLUGINS: CorePluginDefinition[] = [
  {
    id: 'roller',
    manifest: createRollerPlugin().manifest,
    create: createRollerPlugin,
  },
];

export function findCorePlugin(id: PluginId): CorePluginDefinition | undefined {
  return CORE_PLUGINS.find((p) => p.id === id);
}
