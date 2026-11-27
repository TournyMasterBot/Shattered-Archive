// apps/game-client/src/features/userScripts/globalRuntime.ts
import { canonicalConnectionId } from '../connection/connectionId';
import ts from 'typescript';
import type { GlobalCall, ScriptSandboxApi } from './types';
import { toPlainData } from './plainData';
import type { GlobalScriptLanguage } from './globalScriptsStore';
import { getGlobalScriptSource } from './globalScriptsStore';
import { createLuaState, closeLuaState, runLuaChunkInState, callLuaGlobalFunctionWithResult } from './luaRuntime';
import {
  loadPythonModuleBodyNow,
  callPythonModuleFunctionNow,
  resetPythonEngine,
  runPythonSourceInBrowser,
} from './pythonRuntime';

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
  /** False while the Globals source is still loading (it suspended, e.g. time.sleep); `ready` settles then. */
  settled: boolean;
  /** Settles once the Globals source has been run into the engine (never rejects: a failed load is reported). */
  ready: Promise<void>;
};

// Lua and Python each have ONE engine per connection (luaCache / pyCache): the Globals source for the language is
// run into it, and every trigger / alias / timer script of that language then runs in it too (runLuaInEngine /
// runPythonInEngine), so a function or variable defined anywhere is visible everywhere. Editing the Globals
// source restarts the engine; scripts never do.

const jsCache = new Map<string, Record<'javascript' | 'typescript', JsGlobalModule | undefined>>();
const luaCache = new Map<string, LuaGlobalState | undefined>();
const pyCache = new Map<string, PyGlobalState | undefined>();

function connKey(connectionId?: string | null) {
  return canonicalConnectionId(connectionId);
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
    const lua = luaCache.get(k);
    if (lua) closeLuaState(lua.L);
    luaCache.delete(k);
  }
  if (!language || language === 'python') {
    const py = pyCache.get(k);
    if (py) resetPythonEngine(py.moduleName);
    pyCache.delete(k);
  }
}

function ensureJsModule(connectionId: string, language: 'javascript' | 'typescript', api: ScriptSandboxApi): JsGlobalModule {
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

function ensureLuaState(connectionId: string, api: ScriptSandboxApi): LuaGlobalState {
  const k = connKey(connectionId);
  const src = getGlobalScriptSource(connectionId, 'lua');
  const srcHash = hashText(src ?? '');

  const cached = luaCache.get(k);
  if (cached && cached.sourceHash === srcHash) return cached;
  // The Globals source changed: restart the engine rather than layer new definitions over stale ones.
  if (cached) closeLuaState(cached.L);

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

/**
 * The Python engine, with the Globals source run into it. Never waits: a source that does not suspend is loaded
 * before this returns, and one that does leaves `settled` false until `ready` resolves (a second script arriving
 * meanwhile waits on that instead of loading the source again and restarting the engine under the first).
 */
function ensurePythonEngine(connectionId: string, api: ScriptSandboxApi): PyGlobalState {
  const k = connKey(connectionId);
  const src = getGlobalScriptSource(connectionId, 'python');
  const srcHash = hashText(src ?? '');

  const cached = pyCache.get(k);
  if (cached && cached.sourceHash === srcHash) return cached;

  const moduleName = safePythonModuleName(k);
  const state: PyGlobalState = { moduleName, sourceHash: srcHash, settled: true, ready: Promise.resolve() };
  pyCache.set(k, state);

  if (src && src.trim()) {
    // loadPythonModuleBodyNow reports a failure through api.error itself. The engine stays up with whatever the
    // source defined before it failed, and the hash is cached so the error is not repeated on every script.
    const load = loadPythonModuleBodyNow(moduleName, src, api);
    if (!load.settled) {
      state.settled = false;
      state.ready = load.promise.then(() => {
        state.settled = true;
      });
    }
  } else {
    resetPythonEngine(moduleName);
  }
  return state;
}

/**
 * Run a Lua trigger / alias / timer script in the connection's engine. Returns false if it failed to load or
 * raised (already reported through api.error).
 */
export function runLuaInEngine(connectionId: string | null | undefined, source: string, api: ScriptSandboxApi): boolean {
  const conn = connKey(connectionId);
  return runLuaChunkInState(ensureLuaState(conn, api).L, source, api, 'user_script');
}

/**
 * Python counterpart of runLuaInEngine. The script starts running before this returns (unless the Globals source is
 * still loading), as a Python script always has.
 */
export async function runPythonInEngine(
  connectionId: string | null | undefined,
  source: string,
  api: ScriptSandboxApi,
): Promise<void> {
  const st = ensurePythonEngine(connKey(connectionId), api);
  if (!st.settled) await st.ready;
  await runPythonSourceInBrowser(source, api, st.moduleName);
}

function getPathValue(root: any, path: string[]): any {
  let cur = root;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * The calling convention of a JS / TS global: `fn(api, args)` when it declares two or more parameters, otherwise
 * `fn(args)`. `owner` is the object it hangs off, so a method can use `this`.
 */
function callGlobalFunction(fn: (...a: any[]) => unknown, owner: unknown, api: ScriptSandboxApi, callArgs: unknown[]) {
  return fn.length >= 2 ? fn.apply(owner, [api, ...callArgs]) : fn.apply(owner, callArgs);
}

function callJsGlobal(
  connectionId: string,
  parsed: ParsedGlobalId & { language: 'javascript' | 'typescript' },
  api: ScriptSandboxApi,
  args: unknown,
): GlobalCall {
  const mod = ensureJsModule(connectionId, parsed.language, api);
  const label = parsed.thingPath.join('.');
  const fn = getPathValue(mod.exports, parsed.thingPath);

  if (typeof fn !== 'function') {
    const error = `function not found: ${label}`;
    api.error?.(`[Global:${parsed.language}] ${error}`);
    return { settled: true, error };
  }

  const fail = (err: unknown) => {
    const error = errorMessage(err);
    api.error?.(`[Global:${parsed.language}] call failed (${label})`, error);
    return error;
  };

  try {
    const owner = getPathValue(mod.exports, parsed.thingPath.slice(0, -1));
    const result = callGlobalFunction(fn, owner, api, [args]);
    if (!isThenable(result)) return { settled: true, value: toPlainData(result) };

    return {
      settled: false,
      promise: Promise.resolve(result).then(
        (value) => ({ value: toPlainData(value) }),
        (err) => ({ error: fail(err) }),
      ),
    };
  } catch (err) {
    return { settled: true, error: fail(err) };
  }
}

/**
 * Invoke a global function by identifier (`global.<language>.<path>`), reporting the outcome as a GlobalCall: the
 * value at once when the function finished before this returned (every Lua and JS function that is not async,
 * and any Python function that does not suspend), otherwise a promise. This is the one implementation of the
 * invoke contract; invokeGlobalById is the awaitable form of it and the Lua / Python runGlobal bridges the
 * call-like form.
 *
 * The function's return value comes back as plain data (see plainData.ts), whichever language it is written in.
 */
export function invokeGlobalSync(
  connectionId: string | null | undefined,
  globalId: string,
  api: ScriptSandboxApi,
  args?: unknown,
): GlobalCall {
  const parsed = parseGlobalId(globalId);
  if (!parsed) {
    const error = `Invalid identifier: ${String(globalId)}`;
    api.error?.(`[Global] ${error}`);
    return { settled: true, error };
  }

  const conn = connKey(connectionId);

  switch (parsed.language) {
    case 'javascript':
    case 'typescript':
      return callJsGlobal(conn, parsed as ParsedGlobalId & { language: 'javascript' | 'typescript' }, api, args);

    case 'lua': {
      const st = ensureLuaState(conn, api);
      // Convention: define function foo_bar(argsJson) ... end ("foo.bar" maps to "foo_bar")
      const result = callLuaGlobalFunctionWithResult(st.L, parsed.thingPath.join('_'), args, api);
      return result.ok ? { settled: true, value: result.value } : { settled: true, error: result.error };
    }

    case 'python': {
      const st = ensurePythonEngine(conn, api);
      const funcName = parsed.thingPath.join('_'); // allow "foo.bar" by mapping to "foo_bar"
      if (st.settled) return callPythonModuleFunctionNow(st.moduleName, funcName, args, api);

      return {
        settled: false,
        promise: st.ready.then(() => {
          const call = callPythonModuleFunctionNow(st.moduleName, funcName, args, api);
          return call.settled ? { value: call.value, error: call.error } : call.promise;
        }),
      };
    }

    default: {
      const error = `Unsupported language: ${String((parsed as any).language)}`;
      api.error?.(`[Global] ${error}`);
      return { settled: true, error };
    }
  }
}

/** Awaitable invokeGlobalSync: resolves with the function's value, or undefined if it failed (already reported). */
export async function invokeGlobalById(
  connectionId: string | null | undefined,
  globalId: string,
  api: ScriptSandboxApi,
  args?: unknown,
): Promise<unknown> {
  const call = invokeGlobalSync(connectionId, globalId, api, args);
  const outcome = call.settled ? call : await call.promise;
  return outcome.error === undefined ? outcome.value : undefined;
}

// ── JS / TS globals as names in every JS / TS script ──────────────────────────────────────────────────────────────

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Words a script wrapper cannot bind as a name (and `eval` / `arguments`, which strict mode forbids binding).
const UNBINDABLE_NAMES = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'yield let static await implements interface package private protected public eval arguments undefined NaN Infinity'
  ).split(' '),
);

function isPlainContainer(value: unknown): value is object {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A global export as a script sees it. A function is wrapped so a script just calls it, `core.echo({ text })`,
 * and the calling convention above is applied for it with the script's own api; whatever it returns, a value or a
 * promise, is returned untouched, so existing synchronous-looking code keeps working and async code can await. A
 * plain object or array is passed through a read/write view of the real one, so `state.kills++` changes the
 * Globals module's own state; the functions and objects inside it are wrapped the same way. Anything else
 * (a number, a string) is the value at the moment the script started.
 */
function wrapGlobalExport(value: unknown, owner: unknown, api: ScriptSandboxApi): unknown {
  if (typeof value === 'function') {
    return (...callArgs: unknown[]) => callGlobalFunction(value as (...a: any[]) => unknown, owner, api, callArgs);
  }

  if (isPlainContainer(value)) {
    return new Proxy(value, {
      get(target, prop) {
        const inner = Reflect.get(target, prop);
        // A proxy must report a frozen data property as it really is.
        const desc = Reflect.getOwnPropertyDescriptor(target, prop);
        if (desc && !desc.configurable && !desc.writable) return inner;
        return wrapGlobalExport(inner, target, api);
      },
    });
  }

  return value;
}

/**
 * The names a JS / TS script gets from the Globals files: every export of the Globals JavaScript and TypeScript
 * modules, wrapped by wrapGlobalExport. The script's own language wins a clash between the two files, and a name
 * the script wrapper already binds (`taken`: sendCommand, log, event, ...) or one that cannot be a name is left out.
 * Synchronous on purpose: the script must start in the same turn it was triggered in.
 */
export function getJsGlobalScope(
  connectionId: string | null | undefined,
  api: ScriptSandboxApi,
  language: 'javascript' | 'typescript',
  taken: ReadonlySet<string>,
): Record<string, unknown> {
  const conn = connKey(connectionId);
  const scope: Record<string, unknown> = {};

  // Later entries win.
  const order: Array<'javascript' | 'typescript'> =
    language === 'javascript' ? ['typescript', 'javascript'] : ['javascript', 'typescript'];

  for (const lang of order) {
    const exported = ensureJsModule(conn, lang, api).exports;
    if (!exported || typeof exported !== 'object') continue;

    for (const key of Object.keys(exported)) {
      if (!IDENTIFIER.test(key) || UNBINDABLE_NAMES.has(key) || taken.has(key)) continue;
      scope[key] = wrapGlobalExport(exported[key], exported, api);
    }
  }

  return scope;
}
