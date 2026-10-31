import type { AnyUserScript, UserScriptLanguage } from './types';
import type { GlobalScriptLanguage } from './globalScriptsStore';

// The portable script-exchange format, shared with the mobile client
// (shatteredarchive-mobile: dsl-client/features/scripts/script-export.ts). A
// file written by either client must import cleanly into the other, and into a
// second device, with no further effort — that is the contract, so the two
// implementations have to be kept in step.
//
// Split out of UserScriptSandboxModal.tsx so it can be unit-tested: the modal
// imports a .scss module, which this repo's Jest "client" project cannot
// resolve, so nothing inside that file was reachable from a test. The mobile
// side learned the same lesson — its format module is deliberately free of
// runtime imports too.
//
// Two rules make the format actually portable, and both were bugs before:
//  - `key` and `storage` are INFORMATIONAL on import. They record where the data
//    lived on the exporting client; matching against them meant a file only
//    imported back into the exact connection it came from, which blocked
//    mobile->web entirely and web->web between two different connections.
//  - Global scripts and plugin configuration travel WITH the scripts. A trigger
//    calling runGlobal(...) is useless without the file defining the function,
//    and a configured plugin is useless without its config.

export const EXPORT_SCHEMA = 'shatteredArchive.export.v1';

export type ExportFileV1 = {
  schema: 'shatteredArchive.export.v1';
  exportedAt: string;
  app?: string;
  items: Array<{
    storage: 'localStorage';
    key: string;
    format: 'json';
    kind: 'userScripts';
    selection?: { ids: string[] };
    strategyHint?: 'mergeById';
    value: AnyUserScript[];
  }>;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isUserScriptLanguage(v: unknown): v is UserScriptLanguage {
  return v === 'text' || v === 'javascript' || v === 'lua' || v === 'python' || v === 'typescript';
}

export function isUserScriptKind(v: unknown): v is 'trigger' | 'alias' | 'timer' {
  return v === 'trigger' || v === 'alias' || v === 'timer';
}

export function isValidUserScript(v: unknown): v is AnyUserScript {
  if (!isObject(v)) return false;

  const id = v.id;
  const name = v.name;
  const enabled = v.enabled;
  const language = v.language;
  const source = v.source;
  const kind = v.kind;
  const group = v.group;

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof name !== 'string') return false;
  if (typeof enabled !== 'boolean') return false;
  if (!isUserScriptLanguage(language)) return false;
  if (typeof source !== 'string') return false;
  if (!isUserScriptKind(kind)) return false;
  if (group !== undefined && typeof group !== 'string') return false;

  if (kind === 'trigger') {
    const eventName = v.eventName;
    const matchText = v.matchText;
    const dontRequireMatchText = v.dontRequireMatchText;

    if (typeof eventName !== 'string') return false;
    if (typeof matchText !== 'string') return false;
    if (dontRequireMatchText !== undefined && typeof dontRequireMatchText !== 'boolean') return false;

    return true;
  }

  if (kind === 'timer') {
    const intervalMs = v.intervalMs;
    if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) return false;
    return true;
  }

  if (kind === 'alias') {
    const alias = v.alias;
    if (typeof alias !== 'string') return false;
    return true;
  }

  return false;
}

/**
 * Pulls the globalScripts item's sources out of an export file, if it has one.
 * Files written before globals travelled with scripts simply have none, and a
 * null result means "leave local globals alone" rather than "clear them".
 */
export function extractGlobalsItem(text: string): Partial<Record<GlobalScriptLanguage, string>> | null {
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed) || !Array.isArray(parsed.items)) return null;

    for (const it of parsed.items as unknown[]) {
      if (!isObject(it) || it.kind !== 'globalScripts') continue;
      const value = it.value;
      if (!isObject(value)) continue;

      const out: Partial<Record<GlobalScriptLanguage, string>> = {};
      for (const lang of ['javascript', 'typescript', 'lua', 'python'] as GlobalScriptLanguage[]) {
        const text = value[lang];
        if (typeof text === 'string') out[lang] = text;
      }
      return out;
    }
  } catch {
    // Unparseable here means tryParseExportFile already reported it.
  }
  return null;
}

/**
 * Pulls the pluginConfigs item's records out of an export file, if it has one.
 * Null deliberately means "leave local plugin config alone" rather than
 * "clear it", so importing a file written before plugin sharing cannot wipe the
 * importing client's plugin setup.
 */
export function extractPluginConfigsItem(text: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed) || !Array.isArray(parsed.items)) return null;

    for (const it of parsed.items as unknown[]) {
      if (!isObject(it) || it.kind !== 'pluginConfigs') continue;
      const value = it.value;
      if (!Array.isArray(value)) continue;

      // The same structural floor the server applies
      // (UserContentController.TryValidatePluginConfig).
      return value.filter(
        (r: unknown) =>
          isObject(r) &&
          typeof r.id === 'string' &&
          r.id.trim().length > 0 &&
          typeof r.name === 'string' &&
          typeof r.version === 'string' &&
          typeof r.enabled === 'boolean' &&
          r.installedAt !== undefined,
      ) as Record<string, unknown>[];
    }
  } catch {
    // Unparseable here means tryParseExportFile already reported it.
  }
  return null;
}

export function tryParseExportFile(text: string): { ok: true; file: ExportFileV1 } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);

    if (!isObject(parsed)) return { ok: false, error: 'Root JSON must be an object.' };
    if (parsed.schema !== EXPORT_SCHEMA) return { ok: false, error: 'Unsupported schema.' };
    if (!Array.isArray(parsed.items)) return { ok: false, error: 'Missing items array.' };

    const items: ExportFileV1['items'] = [];
    for (const it of parsed.items as unknown[]) {
      if (!isObject(it)) return { ok: false, error: 'Invalid item shape.' };
      if (it.format !== 'json') return { ok: false, error: 'Unsupported format.' };
      // `storage` is informational: the mobile client writes 'asyncStorage'
      // because that is honestly where its data lives, and rejecting that would
      // make every mobile export unimportable here.
      if (typeof it.storage !== 'string') return { ok: false, error: 'Unsupported storage type.' };
      // Globals and plugin configs ride along in the same file; they are applied
      // separately on import, so skip them here rather than failing the parse.
      if (it.kind === 'globalScripts' || it.kind === 'pluginConfigs') continue;
      if (it.kind !== 'userScripts') return { ok: false, error: 'Unsupported kind.' };
      if (typeof it.key !== 'string' || it.key.trim().length === 0) return { ok: false, error: 'Invalid key.' };
      if (!Array.isArray(it.value)) return { ok: false, error: 'Invalid value (expected array).' };

      const validScripts = (it.value as unknown[]).filter(isValidUserScript);

      items.push({
        storage: 'localStorage',
        key: it.key,
        format: 'json',
        kind: 'userScripts',
        selection:
          isObject(it.selection) && Array.isArray(it.selection.ids) ? { ids: it.selection.ids as string[] } : undefined,
        strategyHint: it.strategyHint === 'mergeById' ? 'mergeById' : undefined,
        value: validScripts,
      });
    }

    const file: ExportFileV1 = {
      schema: EXPORT_SCHEMA,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : nowIso(),
      app: typeof parsed.app === 'string' ? parsed.app : undefined,
      items,
    };

    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err ?? 'Parse error') };
  }
}
