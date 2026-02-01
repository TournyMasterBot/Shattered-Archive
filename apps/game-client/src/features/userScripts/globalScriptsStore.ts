// apps/game-client/src/features/userScripts/globalScriptsStore.ts

import { DispatchEvent } from '../event-emitter/event-dispatcher';

export type GlobalScriptLanguage = 'javascript' | 'lua' | 'python' | 'typescript';

const GLOBAL_SCRIPTS_KEY_PREFIX = 'shatteredArchive.userGlobalScripts.';
const GLOBAL_VARS_KEY_PREFIX = 'shatteredArchive.userGlobalVars.';

type GlobalScriptsPayloadV1 = {
  schema: 'shatteredArchive.globalScripts.v1';
  sources: Record<GlobalScriptLanguage, string>;
};

type GlobalVarsPayloadV1 = {
  schema: 'shatteredArchive.globalVars.v1';
  vars: Record<string, unknown>;
};

function safeConnectionId(connectionId?: string | null) {
  return connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
}

export function getGlobalScriptsStorageKey(connectionId?: string | null) {
  return `${GLOBAL_SCRIPTS_KEY_PREFIX}${safeConnectionId(connectionId)}`;
}

export function getGlobalVarsStorageKey(connectionId?: string | null) {
  return `${GLOBAL_VARS_KEY_PREFIX}${safeConnectionId(connectionId)}`;
}

const scriptCache = new Map<string, GlobalScriptsPayloadV1>();

// Vars cache + last-seen raw json string (from *actual* localStorage)
const varsCache = new Map<string, GlobalVarsPayloadV1>();
const varsRawCache = new Map<string, string>();

function defaultScriptsPayload(): GlobalScriptsPayloadV1 {
  return {
    schema: 'shatteredArchive.globalScripts.v1',
    sources: {
      javascript: '',
      lua: '',
      python: '',
      typescript: '',
    },
  };
}

function defaultVarsPayload(): GlobalVarsPayloadV1 {
  return {
    schema: 'shatteredArchive.globalVars.v1',
    vars: {},
  };
}

function readRaw(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeRaw(key: string, raw: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, raw);
}

function readJson(key: string): unknown | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  writeRaw(key, JSON.stringify(value));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function coerceSources(v: unknown): GlobalScriptsPayloadV1 {
  const base = defaultScriptsPayload();

  if (!isObject(v)) return base;
  if (v.schema !== 'shatteredArchive.globalScripts.v1') return base;

  const src = (v as any).sources;
  if (!isObject(src)) return base;

  return {
    schema: 'shatteredArchive.globalScripts.v1',
    sources: {
      javascript: typeof src.javascript === 'string' ? src.javascript : '',
      lua: typeof src.lua === 'string' ? src.lua : '',
      python: typeof src.python === 'string' ? src.python : '',
      typescript: typeof src.typescript === 'string' ? src.typescript : '',
    },
  };
}

function coerceVars(v: unknown): GlobalVarsPayloadV1 {
  const base = defaultVarsPayload();

  if (!isObject(v)) return base;
  if (v.schema !== 'shatteredArchive.globalVars.v1') return base;

  const vars = (v as any).vars;
  if (!isObject(vars)) return base;

  return {
    schema: 'shatteredArchive.globalVars.v1',
    vars: vars as Record<string, unknown>,
  };
}

/* ------------------------------ scripts ------------------------------ */

export function getGlobalScriptsSnapshot(connectionId?: string | null): Record<GlobalScriptLanguage, string> {
  const key = getGlobalScriptsStorageKey(connectionId);

  const cached = scriptCache.get(key);
  if (cached) return cached.sources;

  const parsed = coerceSources(readJson(key));
  scriptCache.set(key, parsed);
  return parsed.sources;
}

export function setGlobalScriptSource(
  connectionId: string | null | undefined,
  language: GlobalScriptLanguage,
  source: string,
) {
  const key = getGlobalScriptsStorageKey(connectionId);

  const payload: GlobalScriptsPayloadV1 = {
    schema: 'shatteredArchive.globalScripts.v1',
    sources: {
      ...(getGlobalScriptsSnapshot(connectionId) ?? {
        javascript: '',
        lua: '',
        python: '',
        typescript: '',
      }),
      [language]: source ?? '',
    } as Record<GlobalScriptLanguage, string>,
  };

  scriptCache.set(key, payload);

  try {
    writeJson(key, payload);
    DispatchEvent('shatteredarchive:globalScripts-updated', {
      connectionId: safeConnectionId(connectionId),
    });
  } catch {
    // ignore
  }
}

export function getGlobalScriptSource(connectionId: string | null | undefined, language: GlobalScriptLanguage): string {
  const snap = getGlobalScriptsSnapshot(connectionId);
  return snap?.[language] ?? '';
}

/* ------------------------------ vars ------------------------------ */

/**
 * Returns vars for a connection.
 *
 * Important behavior:
 * - If localStorage changed (including after a refresh), we re-parse.
 * - If we call set/delete, we also write localStorage immediately so refresh picks it up.
 */
export function getGlobalVarsSnapshot(connectionId?: string | null): Record<string, unknown> {
  const key = getGlobalVarsStorageKey(connectionId);

  const raw = readRaw(key);
  const lastRaw = varsRawCache.get(key);
  const cached = varsCache.get(key);

  // If cache exists and localStorage raw hasn't changed, return cached.
  if (cached && lastRaw === raw) {
    return cached.vars;
  }

  // Otherwise parse fresh (or default).
  const parsed = coerceVars(raw ? (() => {
    try {
      console.log("Preparing to return getGlobalVarsSnapshot", {
        raw
      });
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })() : null);

  varsCache.set(key, parsed);
  varsRawCache.set(key, raw);

  return parsed.vars;
}

export function getGlobalVar(connectionId: string | null | undefined, keyName: string): unknown {
  const vars = getGlobalVarsSnapshot(connectionId);
  return vars[keyName];
}

/**
 * Immediate persistence:
 * - Updates in-memory varsCache
 * - Writes localStorage synchronously (no debounce)
 * - Updates varsRawCache to match what is actually stored
 *
 * This guarantees that after typing "target weed" (and your script calls setGlobalVar),
 * a page refresh will still have the value.
 */
export function setGlobalVar(connectionId: string | null | undefined, keyName: string, value: unknown) {
  const key = getGlobalVarsStorageKey(connectionId);

  const currentPayload: GlobalVarsPayloadV1 = {
    schema: 'shatteredArchive.globalVars.v1',
    vars: { ...(getGlobalVarsSnapshot(connectionId) ?? {}) },
  };

  currentPayload.vars = { ...(currentPayload.vars ?? {}), [keyName]: value };

  // update caches first
  varsCache.set(key, currentPayload);

  // write through immediately
  try {
    const raw = JSON.stringify(currentPayload);
    writeRaw(key, raw);
    varsRawCache.set(key, raw);

    DispatchEvent('shatteredarchive:globalVars-updated', { key });
  } catch {
    // ignore
  }
}

export function deleteGlobalVar(connectionId: string | null | undefined, keyName: string) {
  const key = getGlobalVarsStorageKey(connectionId);

  const currentPayload: GlobalVarsPayloadV1 = {
    schema: 'shatteredArchive.globalVars.v1',
    vars: { ...(getGlobalVarsSnapshot(connectionId) ?? {}) },
  };

  const next = { ...(currentPayload.vars ?? {}) };
  delete next[keyName];
  currentPayload.vars = next;

  // update caches first
  varsCache.set(key, currentPayload);

  // write through immediately
  try {
    const raw = JSON.stringify(currentPayload);
    writeRaw(key, raw);
    varsRawCache.set(key, raw);

    DispatchEvent('shatteredarchive:globalVars-updated', { key });
  } catch {
    // ignore
  }
}
