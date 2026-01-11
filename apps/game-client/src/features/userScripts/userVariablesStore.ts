// apps/game-client/src/features/userScripts/userVariablesStore.ts

const USER_VARS_KEY_PREFIX = 'shatteredArchive.userVariables.';

export type NamedVariables = Record<string, string>;

type NamedVarsPayloadV1 = {
  schema: 'shatteredArchive.namedVars.v1';
  vars: NamedVariables;
};

function safeConnectionId(connectionId?: string | null) {
  return connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
}

export function getUserVariablesStorageKey(connectionId?: string | null) {
  return `${USER_VARS_KEY_PREFIX}${safeConnectionId(connectionId)}`;
}

const cache = new Map<string, NamedVarsPayloadV1>();

function defaultPayload(): NamedVarsPayloadV1 {
  return { schema: 'shatteredArchive.namedVars.v1', vars: {} };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
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

function coerce(v: unknown): NamedVarsPayloadV1 {
  const base = defaultPayload();

  if (!isObject(v)) return base;
  if (v.schema !== 'shatteredArchive.namedVars.v1') return base;

  const vars = (v as any).vars;
  if (!isObject(vars)) return base;

  const out: NamedVariables = {};
  for (const [k, val] of Object.entries(vars)) {
    if (typeof k === 'string' && typeof val === 'string') out[k] = val;
  }

  return { schema: 'shatteredArchive.namedVars.v1', vars: out };
}

export function getUserVariablesSnapshot(connectionId?: string | null): NamedVariables {
  const key = getUserVariablesStorageKey(connectionId);
  const cached = cache.get(key);
  if (cached) return cached.vars;

  const parsed = coerce(readJson(key));
  cache.set(key, parsed);
  return parsed.vars;
}

export function setNamedVariable(connectionId: string | null | undefined, name: string, value: string) {
  const key = getUserVariablesStorageKey(connectionId);
  const current = cache.get(key) ?? coerce(readJson(key));

  current.vars = { ...(current.vars ?? {}), [name]: value ?? '' };
  cache.set(key, current);

  try {
    writeJson(key, current);
    window.dispatchEvent(
      new CustomEvent('game:userVariables-updated', { detail: { connectionId: safeConnectionId(connectionId) } }),
    );
  } catch {
    // ignore
  }
}

export function deleteNamedVariable(connectionId: string | null | undefined, name: string) {
  const key = getUserVariablesStorageKey(connectionId);
  const current = cache.get(key) ?? coerce(readJson(key));

  const next = { ...(current.vars ?? {}) };
  delete next[name];
  current.vars = next;
  cache.set(key, current);

  try {
    writeJson(key, current);
    window.dispatchEvent(
      new CustomEvent('game:userVariables-updated', { detail: { connectionId: safeConnectionId(connectionId) } }),
    );
  } catch {
    // ignore
  }
}

/**
 * Utility: find variable placeholders in a template, e.g. "{TARGET}"
 */
export function extractVariableNames(template: string): string[] {
  const out: string[] = [];
  const re = /\{([A-Za-z0-9_]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Replace "{NAME}" placeholders with stored values.
 * If a placeholder has no value, we mark ok=false (so callers can decide not to match).
 */
export function resolveTemplate(
  template: string,
  vars: NamedVariables,
): { ok: true; text: string } | { ok: false; text: string } {
  const names = extractVariableNames(template);
  let ok = true;

  const out = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_all, name: string) => {
    const v = vars[name];
    if (v == null) ok = false;
    return v ?? '';
  });

  return ok ? { ok: true, text: out } : { ok: false, text: out };
}
