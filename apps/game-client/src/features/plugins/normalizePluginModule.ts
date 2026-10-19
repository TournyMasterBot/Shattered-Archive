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
        actions: Array.isArray(mod.configSchema.actions) ? mod.configSchema.actions : undefined,
      }
    : {
        defaults: {},
        fields: [],
      };

  return {
    // Spread first: any hook not normalized below passes through untouched. This used to be a
    // field-by-field copy, and `onAlias` was simply never listed — so since b825d70 (2026-08-14)
    // `tryExecuteAlias`, which reads the normalized module, found no alias handler on ANY plugin
    // (brew's `brew <name>`, questbot's `pq start`, gourd, people, enchant, ...). A whitelist drops
    // the next new IPluginModule hook the same way.
    ...mod,
    manifest,
    assets,
    configSchema,
  };
}
