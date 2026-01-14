// apps/game-client/src/features/userScripts/globalRuntime.ts
import ts from 'typescript';
import type { ScriptSandboxApi } from './types';
import type { GlobalScriptLanguage } from './globalScriptsStore';
import { getGlobalScriptSource } from './globalScriptsStore';
import { createLuaState, runLuaChunkInState, callLuaGlobalFunctionInState } from './luaRuntime';
import { loadPythonModuleBody, callPythonModuleFunction } from './pythonRuntime';

type ParsedGlobalId = { language: GlobalScriptLanguage; thingPath: string[] };

function parseGlobalId(id: string): ParsedGlobalId | null {
  const parts = (id ?? '').split('.');
  if (parts.length < 3) return null;
  if (parts[0] !== 'global') return null;

  const lang = parts[1] as GlobalScriptLanguage;
  if (lang !== 'javascript' && lang !== 'lua' && lang !== 'python' && lang !== 'typescript') return null;

  const thingPath = parts.slice(2).filter((p) => p && p.trim().length > 0);
  if (thingPath.length === 0) return null;

  return { language: lang, thingPath };
}

function hashText(s: string): string {
  // simple non-crypto hash (fast, stable enough for cache invalidation)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

type JsGlobalModule = {
  exports: any;
  sourceHash: string;
};

type LuaGlobalState = {
  L: any;
  sourceHash: string;
};

type PyGlobalState = {
  moduleName: string;
  sourceHash: string;
};

const jsCache = new Map<string, Record<'javascript' | 'typescript', JsGlobalModule | undefined>>();
const luaCache = new Map<string, LuaGlobalState | undefined>();
const pyCache = new Map<string, PyGlobalState | undefined>();

function connKey(connectionId?: string | null) {
  return connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
}

function safePythonModuleName(connectionId: string) {
  // Must be a valid identifier-ish string for Skulpt.
  return `__sa_global_${connectionId.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

export function invalidateGlobalRuntime(connectionId?: string | null, language?: GlobalScriptLanguage) {
  const k = connKey(connectionId);

  if (!language || language === 'javascript' || language === 'typescript') {
    jsCache.delete(k);
  }
  if (!language || language === 'lua') {
    luaCache.delete(k);
  }
  if (!language || language === 'python') {
    pyCache.delete(k);
  }
}

async function ensureJsModule(
  connectionId: string,
  language: 'javascript' | 'typescript',
  api: ScriptSandboxApi,
): Promise<JsGlobalModule> {
  const k = connKey(connectionId);
  const src = getGlobalScriptSource(connectionId, language);
  const srcHash = hashText(src ?? '');

  const perConn = jsCache.get(k) ?? { javascript: undefined, typescript: undefined };
  const cached = perConn[language];

  if (cached && cached.sourceHash === srcHash) return cached;

  if (!src || !src.trim()) {
    const empty: JsGlobalModule = { exports: {}, sourceHash: srcHash };
    perConn[language] = empty;
    jsCache.set(k, perConn);
    return empty;
  }

  let jsSource = src;

  if (language === 'typescript') {
    try {
      const { outputText } = ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2018,
          strict: false,
        },
      });
      jsSource = outputText;
    } catch (err) {
      api.error?.('[Global:TS] transpile failed', err instanceof Error ? err.message : String(err));
      const mod: JsGlobalModule = { exports: {}, sourceHash: srcHash };
      perConn[language] = mod;
      jsCache.set(k, perConn);
      return mod;
    }
  }

  // Module wrapper with CommonJS-ish exports.
  // Convention for user global file:
  //   exports.foo = (api, args) => ...
  //   module.exports = { foo(api,args){...} }
  try {
    const module = { exports: {} as any };
    const exportsObj = module.exports;

    // Provide a minimal set of safe globals (api is NOT injected at module init time).
    // Users should accept `api` as a parameter in exported functions.
    const fn = new Function('module', 'exports', `"use strict";\n${jsSource}\n;return module.exports;`);
    const result = fn(module, exportsObj) ?? module.exports;

    const mod: JsGlobalModule = { exports: result, sourceHash: srcHash };
    perConn[language] = mod;
    jsCache.set(k, perConn);
    return mod;
  } catch (err) {
    api.error?.('[Global:JS] compile/exec failed', err instanceof Error ? err.message : String(err));
    const mod: JsGlobalModule = { exports: {}, sourceHash: srcHash };
    perConn[language] = mod;
    jsCache.set(k, perConn);
    return mod;
  }
}

async function ensureLuaState(connectionId: string, api: ScriptSandboxApi): Promise<LuaGlobalState> {
  const k = connKey(connectionId);
  const src = getGlobalScriptSource(connectionId, 'lua');
  const srcHash = hashText(src ?? '');

  const cached = luaCache.get(k);
  if (cached && cached.sourceHash === srcHash) return cached;

  const L = createLuaState();

  if (src && src.trim()) {
    const ok = runLuaChunkInState(L, src, api, 'global_lua');
    if (!ok) {
      // keep state, but it's empty/failed; calls will likely fail too
    }
  }

  const next: LuaGlobalState = { L, sourceHash: srcHash };
  luaCache.set(k, next);
  return next;
}

async function ensurePythonGlobalModule(connectionId: string, api: ScriptSandboxApi): Promise<PyGlobalState> {
  const k = connKey(connectionId);
  const src = getGlobalScriptSource(connectionId, 'python');
  const srcHash = hashText(src ?? '');

  const cached = pyCache.get(k);
  if (cached && cached.sourceHash === srcHash) return cached;

  const moduleName = safePythonModuleName(k);

  if (src && src.trim()) {
    await loadPythonModuleBody(moduleName, src, api);
  } else {
    // still register module name in cache; calls will fail if function not present
  }

  const next: PyGlobalState = { moduleName, sourceHash: srcHash };
  pyCache.set(k, next);
  return next;
}

function getPathValue(root: any, path: string[]): any {
  let cur = root;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export async function invokeGlobalById(
  connectionId: string | null | undefined,
  globalId: string,
  api: ScriptSandboxApi,
  args?: unknown,
): Promise<unknown> {
  const parsed = parseGlobalId(globalId);
  if (!parsed) {
    api.error?.(`[Global] Invalid identifier: ${String(globalId)}`);
    return undefined;
  }

  const conn = connKey(connectionId);

  switch (parsed.language) {
    case 'javascript':
    case 'typescript': {
      const mod = await ensureJsModule(conn, parsed.language, api);
      const fn = getPathValue(mod.exports, parsed.thingPath);

      if (typeof fn !== 'function') {
        api.error?.(`[Global:${parsed.language}] function not found: ${parsed.thingPath.join('.')}`);
        return undefined;
      }

      try {
        // If they wrote foo(api,args) use both; if foo(args) it can ignore api.
        return await Promise.resolve(fn.length >= 2 ? fn(api, args) : fn(args));
      } catch (err) {
        api.error?.(
          `[Global:${parsed.language}] call failed (${parsed.thingPath.join('.')})`,
          err instanceof Error ? err.message : String(err),
        );
        return undefined;
      }
    }

    case 'lua': {
      const st = await ensureLuaState(conn, api);
      const funcName = parsed.thingPath.join('_'); // allow "foo.bar" by mapping to "foo_bar"
      // Convention: define function foo_bar(argsJson) ... end
      const ok = callLuaGlobalFunctionInState(st.L, funcName, args, api);
      return ok ? true : undefined;
    }

    case 'python': {
      const st = await ensurePythonGlobalModule(conn, api);
      const funcName = parsed.thingPath.join('_'); // allow "foo.bar" by mapping to "foo_bar"
      await callPythonModuleFunction(st.moduleName, funcName, args, api);
      return true;
    }

    default: {
      api.error?.(`[Global] Unsupported language: ${String((parsed as any).language)}`);
      return undefined;
    }
  }
}
