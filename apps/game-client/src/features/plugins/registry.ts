// apps\game-client\src\features\plugins\registry.ts
import type { IPluginModule, PluginId, PluginManifest } from '@shatteredarchive/types-client';
import { createRollerPlugin } from './core-plugins/roller.plugin';
import { createStandupPlugin } from './core-plugins/standup.plugin';
import { createRespellPlugin } from './core-plugins/respell.plugin';
import { createBrewPlugin } from './core-plugins/brew.plugin';
import { createDisarmPlugin } from './core-plugins/disarm.plugin';
import { createColorKitPlugin } from './core-plugins/colorkit.plugin';
import { createEnchantPlugin } from './core-plugins/enchant.plugin';
import { createGourdPlugin } from './core-plugins/gourd.plugin';
import { createPeoplePlugin } from './core-plugins/people.plugin';
import { createHighlighterPlugin } from './core-plugins/highlighter.plugin';

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
  {
    id: 'enchant',
    manifest: createEnchantPlugin().manifest,
    create: createEnchantPlugin,
  },
  {
    id: 'gourd',
    manifest: createGourdPlugin().manifest,
    create: createGourdPlugin,
  },
  {
    id: 'people',
    manifest: createPeoplePlugin().manifest,
    create: createPeoplePlugin,
  },
  {
    id: 'highlighter',
    manifest: createHighlighterPlugin().manifest,
    create: createHighlighterPlugin,
  },
];

export function findCorePlugin(id: PluginId): CorePluginDefinition | undefined {
  return CORE_PLUGINS.find((p) => p.id === id);
}
