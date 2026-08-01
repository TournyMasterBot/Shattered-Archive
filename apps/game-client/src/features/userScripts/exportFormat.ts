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
  const group = (v as any).group;

  if (typeof id !== 'string' || id.trim().length === 0) return false;
  if (typeof name !== 'string') return false;
  if (typeof enabled !== 'boolean') return false;
  if (!isUserScriptLanguage(language)) return false;
  if (typeof source !== 'string') return false;
  if (!isUserScriptKind(kind)) return false;
  if (group !== undefined && typeof group !== 'string') return false;

  if (kind === 'trigger') {
    const eventName = (v as any).eventName;
    const matchText = (v as any).matchText;
    const dontRequireMatchText = (v as any).dontRequireMatchText;

    if (typeof eventName !== 'string') return false;
    if (typeof matchText !== 'string') return false;
    if (dontRequireMatchText !== undefined && typeof dontRequireMatchText !== 'boolean') return false;

    return true;
  }

  if (kind === 'timer') {
    const intervalMs = (v as any).intervalMs;
    if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) return false;
    return true;
  }

  if (kind === 'alias') {
    const alias = (v as any).alias;
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
    if (!isObject(parsed) || !Array.isArray((parsed as any).items)) return null;

    for (const it of (parsed as any).items) {
      if (!isObject(it) || (it as any).kind !== 'globalScripts') continue;
      const value = (it as any).value;
      if (!isObject(value)) continue;

      const out: Partial<Record<GlobalScriptLanguage, string>> = {};
      for (const lang of ['javascript', 'typescript', 'lua', 'python'] as GlobalScriptLanguage[]) {
        if (typeof (value as any)[lang] === 'string') out[lang] = (value as any)[lang];
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
    if (!isObject(parsed) || !Array.isArray((parsed as any).items)) return null;

    for (const it of (parsed as any).items) {
      if (!isObject(it) || (it as any).kind !== 'pluginConfigs') continue;
      const value = (it as any).value;
      if (!Array.isArray(value)) continue;

      // The same structural floor the server applies
      // (UserContentController.TryValidatePluginConfig).
      return value.filter(
        (r: unknown) =>
          isObject(r) &&
          typeof (r as any).id === 'string' &&
          (r as any).id.trim().length > 0 &&
          typeof (r as any).name === 'string' &&
          typeof (r as any).version === 'string' &&
          typeof (r as any).enabled === 'boolean' &&
          (r as any).installedAt !== undefined,
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
    if ((parsed as any).schema !== EXPORT_SCHEMA) return { ok: false, error: 'Unsupported schema.' };
    if (!Array.isArray((parsed as any).items)) return { ok: false, error: 'Missing items array.' };

    const items: ExportFileV1['items'] = [];
    for (const it of (parsed as any).items) {
      if (!isObject(it)) return { ok: false, error: 'Invalid item shape.' };
      if ((it as any).format !== 'json') return { ok: false, error: 'Unsupported format.' };
      // `storage` is informational: the mobile client writes 'asyncStorage'
      // because that is honestly where its data lives, and rejecting that would
      // make every mobile export unimportable here.
      if (typeof (it as any).storage !== 'string') return { ok: false, error: 'Unsupported storage type.' };
      // Globals and plugin configs ride along in the same file; they are applied
      // separately on import, so skip them here rather than failing the parse.
      if ((it as any).kind === 'globalScripts' || (it as any).kind === 'pluginConfigs') continue;
      if ((it as any).kind !== 'userScripts') return { ok: false, error: 'Unsupported kind.' };
      if (typeof (it as any).key !== 'string' || (it as any).key.trim().length === 0)
        return { ok: false, error: 'Invalid key.' };
      if (!Array.isArray((it as any).value)) return { ok: false, error: 'Invalid value (expected array).' };

      const validScripts = (it as any).value.filter(isValidUserScript);

      items.push({
        storage: 'localStorage',
        key: (it as any).key,
        format: 'json',
        kind: 'userScripts',
        selection:
          isObject((it as any).selection) && Array.isArray(((it as any).selection as any).ids)
            ? { ids: ((it as any).selection as any).ids }
            : undefined,
        strategyHint: (it as any).strategyHint === 'mergeById' ? 'mergeById' : undefined,
        value: validScripts,
      });
    }

    const file: ExportFileV1 = {
      schema: EXPORT_SCHEMA,
      exportedAt: typeof (parsed as any).exportedAt === 'string' ? (parsed as any).exportedAt : nowIso(),
      app: typeof (parsed as any).app === 'string' ? (parsed as any).app : undefined,
      items,
    };

    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err ?? 'Parse error') };
  }
}
