// apps\game-client\src\features\plugins\registry.ts
import type { IPluginModule, PluginId, PluginManifest } from '@shatteredarchive/types-client';
import { createRollerPlugin } from './core-plugins/roller.plugin';
import { createStandupPlugin } from './core-plugins/standup.plugin';
import { createRespellPlugin } from './core-plugins/respell.plugin';
import { createBrewPlugin } from './core-plugins/brew.plugin';
import { createDisarmPlugin } from './core-plugins/disarm.plugin';
import { createColorKitPlugin } from './core-plugins/colorkit.plugin';

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
  {
    id: 'standup',
    manifest: createStandupPlugin().manifest,
    create: createStandupPlugin,
  },
  {
    id: 'respell',
    manifest: createRespellPlugin().manifest,
    create: createRespellPlugin,
  },
  {
    id: 'brew',
    manifest: createBrewPlugin().manifest,
    create: createBrewPlugin,
  },
  {
    id: 'disarm',
    manifest: createDisarmPlugin().manifest,
    create: createDisarmPlugin,
  },
  {
    id: 'colorkit',
    manifest: createColorKitPlugin().manifest,
    create: createColorKitPlugin,
  },
];

export function findCorePlugin(id: PluginId): CorePluginDefinition | undefined {
  return CORE_PLUGINS.find((p) => p.id === id);
}
