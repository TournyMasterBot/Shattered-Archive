// apps\game-client\src\features\plugins\normalizePluginModule.ts
import type { IPluginModule, PluginAssets, PluginManifest, PluginConfigSchema } from '@shatteredarchive/types-client';

function asString(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function asBool(x: unknown): boolean {
  return x === true;
}

export function normalizePluginModule(mod: IPluginModule): IPluginModule {
  const manifest: PluginManifest = {
    id: asString(mod?.manifest?.id),
    name: asString(mod?.manifest?.name),
    version: asString(mod?.manifest?.version),
    author: asString(mod?.manifest?.author) || undefined,
    description: asString(mod?.manifest?.description) || undefined,
    supportsExport: asBool(mod?.manifest?.supportsExport),
  };

  const assets: PluginAssets | undefined = mod.assets
    ? {
        css: asString(mod.assets.css) || undefined,
        scripts: Array.isArray(mod.assets.scripts) ? mod.assets.scripts : undefined,
      }
    : undefined;

  const configSchema: PluginConfigSchema = mod.configSchema
    ? {
        defaults:
          mod.configSchema.defaults && typeof mod.configSchema.defaults === 'object'
            ? (mod.configSchema.defaults as Record<string, unknown>)
            : undefined,
        fields: Array.isArray(mod.configSchema.fields) ? mod.configSchema.fields : [],
      }
    : {
        defaults: {},
        fields: [],
      };

  return {
    manifest,
    assets,
    configSchema,
    onEnable: mod.onEnable,
    onDisable: mod.onDisable,
    onEvent: mod.onEvent,
    exportPlugin: mod.exportPlugin,
  };
}
