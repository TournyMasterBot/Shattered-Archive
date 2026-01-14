// apps/game-client/src/features/userScripts/globalScriptsStore.ts

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
const varsCache = new Map<string, GlobalVarsPayloadV1>();

const pendingVarsSave = new Map<string, number>();

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

function readJson(key: string): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
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
    window.dispatchEvent(
      new CustomEvent('game:globalScripts-updated', { detail: { connectionId: safeConnectionId(connectionId) } }),
    );
  } catch {
    // ignore
  }
}

export function getGlobalScriptSource(connectionId: string | null | undefined, language: GlobalScriptLanguage): string {
  const snap = getGlobalScriptsSnapshot(connectionId);
  return snap?.[language] ?? '';
}

export function getGlobalVarsSnapshot(connectionId?: string | null): Record<string, unknown> {
  const key = getGlobalVarsStorageKey(connectionId);
  const cached = varsCache.get(key);
  if (cached) return cached.vars;

  const parsed = coerceVars(readJson(key));
  varsCache.set(key, parsed);
  return parsed.vars;
}

function scheduleVarsSave(key: string) {
  if (typeof window === 'undefined') return;

  const existing = pendingVarsSave.get(key);
  if (existing) window.clearTimeout(existing);

  // Debounce a bit to reduce thrash when scripts set vars frequently
  const id = window.setTimeout(() => {
    pendingVarsSave.delete(key);
    const payload = varsCache.get(key);
    if (!payload) return;

    try {
      writeJson(key, payload);
      window.dispatchEvent(new CustomEvent('game:globalVars-updated', { detail: { key } }));
    } catch {
      // ignore
    }
  }, 200);

  pendingVarsSave.set(key, id);
}

export function getGlobalVar(connectionId: string | null | undefined, keyName: string): unknown {
  const vars = getGlobalVarsSnapshot(connectionId);
  return vars[keyName];
}

export function setGlobalVar(connectionId: string | null | undefined, keyName: string, value: unknown) {
  const key = getGlobalVarsStorageKey(connectionId);
  const current = varsCache.get(key) ?? coerceVars(readJson(key));

  current.vars = { ...(current.vars ?? {}), [keyName]: value };
  varsCache.set(key, current);

  scheduleVarsSave(key);
}

export function deleteGlobalVar(connectionId: string | null | undefined, keyName: string) {
  const key = getGlobalVarsStorageKey(connectionId);
  const current = varsCache.get(key) ?? coerceVars(readJson(key));

  const next = { ...(current.vars ?? {}) };
  delete next[keyName];
  current.vars = next;

  varsCache.set(key, current);
  scheduleVarsSave(key);
}
