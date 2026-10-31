// apps/game-client/src/features/userScripts/luaRuntime.ts
import type { GlobalCall, ScriptSandboxApi } from './types';
import { lua, lauxlib, lualib, to_luastring } from 'fengari-web';

/**
 * Push a JS function onto the Lua stack as a C function.
 */
function pushJsFunction(L: any, fn: (Linner: any) => number) {
  lua.lua_pushcfunction(L, fn);
}

/**
 * Recursively push a plain JS value onto the Lua stack as the Lua-native
 * equivalent (table for objects/arrays, string/number/boolean/nil for
 * primitives). Fengari has no built-in JS<->Lua remapper (unlike Skulpt's
 * ffi.remapToPy), so this is what lets `event` cross the bridge as a table.
 */
function pushJsValue(L: any, value: unknown): void {
  if (value === null || value === undefined) {
    lua.lua_pushnil(L);
    return;
  }
  if (typeof value === 'string') {
    lua.lua_pushstring(L, to_luastring(value));
    return;
  }
  if (typeof value === 'number') {
    // A whole number is a Lua integer, so `"n=" .. 5` reads "n=5" rather than "n=5.0", and integer-only functions
    // (string.rep, table indexes, //) accept it. Anything else, or too big to be exact, stays a float.
    if (Number.isSafeInteger(value)) lua.lua_pushinteger(L, value);
    else lua.lua_pushnumber(L, value);
    return;
  }
  if (typeof value === 'boolean') {
    lua.lua_pushboolean(L, value);
    return;
  }
  if (Array.isArray(value)) {
    lua.lua_newtable(L);
    value.forEach((item, idx) => {
      pushJsValue(L, item);
      lua.lua_rawseti(L, -2, idx + 1);
    });
    return;
  }
  if (typeof value === 'object') {
    lua.lua_newtable(L);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      pushJsValue(L, v);
      lua.lua_setfield(L, -2, to_luastring(k));
    }
    return;
  }
  lua.lua_pushstring(L, to_luastring(String(value)));
}

/**
 * Create a fresh Lua state with standard libs opened.
 */
export function createLuaState(): any {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  return L;
}

const LUA_TO_JS_MAX_DEPTH = 16;

/**
 * Read the Lua value at `index` as plain data: boolean, number, string, a table as a list (keys 1..n, nothing
 * else) or a dict. nil, functions, userdata and threads have no plain form and read as undefined, as does a table
 * nested deeper than LUA_TO_JS_MAX_DEPTH (which is also what stops a table that contains itself).
 */
export function luaToJs(L: any, index: number, depth = 0): unknown {
  switch (lua.lua_type(L, index)) {
    case lua.LUA_TBOOLEAN:
      return lua.lua_toboolean(L, index);
    case lua.LUA_TNUMBER:
      return lua.lua_tonumber(L, index);
    case lua.LUA_TSTRING:
      return lua.lua_tojsstring(L, index);
    case lua.LUA_TTABLE:
      return depth >= LUA_TO_JS_MAX_DEPTH ? undefined : luaTableToJs(L, index, depth);
    default:
      return undefined;
  }
}

function luaTableToJs(L: any, index: number, depth: number): unknown {
  // Each level of nesting holds a key and a value on the stack; only LUA_MINSTACK slots are guaranteed.
  if (!lua.lua_checkstack(L, 4)) return undefined;

  const table = lua.lua_absindex(L, index);
  const entries: Array<[string | number, unknown]> = [];

  lua.lua_pushnil(L);
  while (lua.lua_next(L, table) !== 0) {
    // key at -2, value at -1. Only read a key by its own type: converting a number key to a string in place would
    // confuse lua_next.
    const keyType = lua.lua_type(L, -2);
    if (keyType === lua.LUA_TNUMBER) entries.push([lua.lua_tonumber(L, -2), luaToJs(L, -1, depth + 1)]);
    else if (keyType === lua.LUA_TSTRING) entries.push([lua.lua_tojsstring(L, -2), luaToJs(L, -1, depth + 1)]);
    lua.lua_pop(L, 1);
  }

  const isList = entries.every(([k]) => typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= entries.length);
  if (isList) {
    const list: unknown[] = new Array(entries.length);
    for (const [k, v] of entries) list[(k as number) - 1] = v;
    return list;
  }

  const dict: Record<string, unknown> = {};
  for (const [k, v] of entries) dict[String(k)] = v;
  return dict;
}

/** runGlobal's second argument: a table or other value as plain data, or a string (parsed as JSON when it is). */
function readRunGlobalArgs(L: any, index: number): unknown {
  if (lua.lua_gettop(L) < index || lua.lua_isnil(L, index)) return undefined;
  if (lua.lua_type(L, index) !== lua.LUA_TSTRING) return luaToJs(L, index);

  const raw = lua.lua_tojsstring(L, index);
  if (raw === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** States that have been closed. A runGlobal callback that resolves after its engine restarted must not run. */
const closedStates = new WeakSet<object>();

/** Call the Lua function kept in the registry under `ref` with (result, error), under the api that asked. */
function fireLuaCallback(L: any, ref: number, api: ScriptSandboxApi, result: unknown, errorMessage?: string): void {
  if (closedStates.has(L)) return;

  runWithApi(L, api, () => {
    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
    lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref);
    pushJsValue(L, result ?? null);
    pushJsValue(L, errorMessage ?? null);
    if (lua.lua_pcall(L, 2, 0, 0) !== lua.LUA_OK) {
      api.error?.(`Lua runGlobal callback error: ${lua.lua_tojsstring(L, -1)}`);
    }
  });
}

/**
 * runGlobal(id, args?, callback?) for Lua. `args` may be a table (sent as plain data) or a JSON string.
 *
 * It still works as a plain statement, and now also as an ordinary call: when the global finishes before runGlobal
 * returns (a Lua or JS function, most Python) its result is the return value, so `local r = runGlobal(...)` just
 * works. One that is still running (an async JS function, a Python script that sleeps) returns nil; give a
 * callback to get its result later. The callback is ALWAYS called, after the calling script has finished, as
 * callback(result, nil), or callback(nil, message) if the global failed. With no callback the outcome is only
 * logged, as before.
 */
function makeRunGlobal(L: any, api: ScriptSandboxApi): (Linner: any) => number {
  return (Linner) => {
    const id = lua.lua_tojsstring(Linner, 1);
    const args = readRunGlobalArgs(Linner, 2);

    let callbackRef: number | null = null;
    if (lua.lua_isfunction(Linner, 3)) {
      lua.lua_pushvalue(Linner, 3);
      callbackRef = lauxlib.luaL_ref(Linner, lua.LUA_REGISTRYINDEX);
    }

    const call: GlobalCall = api.runGlobalNow
      ? api.runGlobalNow(id, args)
      : { settled: false, promise: asOutcome(api.runGlobal?.(id, args)) };

    const outcome = call.settled ? Promise.resolve(call) : call.promise;
    void outcome.then(({ value, error }) => {
      if (callbackRef !== null) fireLuaCallback(L, callbackRef, api, value, error);
      else if (error !== undefined) api.error?.('[Lua runGlobal] failed', error);
      else api.log?.('[Lua runGlobal] OK', value);
    });

    // Always one result (nil when there is no value), so tostring(runGlobal(...)) and the like are safe to write.
    pushJsValue(Linner, call.settled && call.error === undefined ? (call.value ?? null) : null);
    return 1;
  };
}

/** An api without runGlobalNow only has the promise form; fold its result/rejection into the outcome shape. */
function asOutcome(result: Promise<unknown> | undefined): Promise<{ value?: unknown; error?: string }> {
  return Promise.resolve(result).then(
    (value) => ({ value }),
    (err) => ({ error: err instanceof Error ? err.message : String(err) }),
  );
}

/**
 * Bridge ScriptSandboxApi into Lua as:
 *   - global table: api.log, api.error, api.sendCommand, api.httpGetJson, api.writeTerminal
 *   - global fns:  log(...), error(...), sendCommand(...), httpGetJson(...), writeTerminal(...)
 *
 * EXTENDED:
 *   - runGlobal(id, argsJson?)
 *   - getGlobalVar(key)
 *   - setGlobalVar(key, valueJson)
 *   - deleteGlobalVar(key)
 *   - getNamedVar(name)
 *   - event (table: event.name, event.payload, ...; nil if not applicable)
 */
export function bindApiToLuaState(L: any, api: ScriptSandboxApi) {
  // ----- 1) api table -----
  lua.lua_newtable(L);

  const setApiField = (name: string, fn: (Linner: any) => number) => {
    pushJsFunction(L, fn);
    lua.lua_setfield(L, -2, to_luastring(name));
  };

  // api.log(msg)
  setApiField('log', (Linner) => {
    const msg = lua.lua_tojsstring(Linner, 1);
    api.log?.(msg);
    return 0;
  });

  // api.error(msg)
  setApiField('error', (Linner) => {
    const msg = lua.lua_tojsstring(Linner, 1);
    api.error?.(msg);
    return 0;
  });

  // api.sendCommand(cmd)
  setApiField('sendCommand', (Linner) => {
    const cmd = lua.lua_tojsstring(Linner, 1);
    api.sendCommand?.(cmd);
    return 0;
  });

  // api.httpGetJson(url) – fire-and-forget bridge
  if (api.httpGetJson) {
    setApiField('httpGetJson', (Linner) => {
      const url = lua.lua_tojsstring(Linner, 1);
      api
        .httpGetJson?.(url)
        .then((result) => {
          api.log?.('[Lua httpGetJson] OK', result);
        })
        .catch((err) => {
          api.error?.('[Lua httpGetJson] failed', err instanceof Error ? err.message : String(err));
        });
      return 0; // no Lua return values
    });
  }

  // api.writeTerminal(dsl) – DSL-colored output → terminal bypass path
  if (api.writeTerminal) {
    setApiField('writeTerminal', (Linner) => {
      const dsl = lua.lua_tojsstring(Linner, 1);
      api.writeTerminal?.(dsl);
      return 0;
    });
  }

  // api.runGlobal(id, args?, callback?)
  if (api.runGlobal) {
    setApiField('runGlobal', makeRunGlobal(L, api));
  }

  // api.getGlobalVar(key)
  if (api.getGlobalVar) {
    setApiField('getGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      const v = api.getGlobalVar?.(key);
      const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      lua.lua_pushstring(Linner, to_luastring(s));
      return 1;
    });
  }

  // api.setGlobalVar(key, valueJsonOrString)
  if (api.setGlobalVar) {
    setApiField('setGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      const raw = lua.lua_gettop(Linner) >= 2 ? lua.lua_tojsstring(Linner, 2) : '';
      const parsed = safeJsonParse(raw);
      api.setGlobalVar?.(key, parsed ?? raw);
      return 0;
    });
  }

  // api.deleteGlobalVar(key)
  if (api.deleteGlobalVar) {
    setApiField('deleteGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      api.deleteGlobalVar?.(key);
      return 0;
    });
  }

  // api.getNamedVar(name)
  if (api.getNamedVar) {
    setApiField('getNamedVar', (Linner) => {
      const name = lua.lua_tojsstring(Linner, 1);
      const v = api.getNamedVar?.(name);
      lua.lua_pushstring(Linner, to_luastring(v ?? ''));
      return 1;
    });
  }

  // api.doAfter(delayMs, type, command)
  if (api.doAfter) {
    setApiField('doAfter', (Linner) => {
      const delayMs = lua.lua_tonumber(Linner, 1) as number;
      const type = lua.lua_tojsstring(Linner, 2) as 'world' | 'alias';
      const command = lua.lua_tojsstring(Linner, 3);
      api.doAfter?.(delayMs, type, command);
      return 0;
    });
  }

  // api.event – current trigger/alias/timer context, as a Lua table:
  //   api.event.name, api.event.payload, api.event.payload.text, etc.
  // nil when no event context is active (e.g. most Timer scripts).
  pushJsValue(L, api.event ?? null);
  lua.lua_setfield(L, -2, to_luastring('event'));

  // expose table as global "api"
  lua.lua_setglobal(L, to_luastring('api'));

  // ----- 2) Global convenience functions -----
  const setGlobal = (name: string, fn: (Linner: any) => number) => {
    pushJsFunction(L, fn);
    lua.lua_setglobal(L, to_luastring(name));
  };

  // log(msg)
  setGlobal('log', (Linner) => {
    const msg = lua.lua_tojsstring(Linner, 1);
    api.log?.(msg);
    return 0;
  });

  // error(msg)
  setGlobal('error', (Linner) => {
    const msg = lua.lua_tojsstring(Linner, 1);
    api.error?.(msg);
    return 0;
  });

  // sendCommand(cmd)
  setGlobal('sendCommand', (Linner) => {
    const cmd = lua.lua_tojsstring(Linner, 1);
    api.sendCommand?.(cmd);
    return 0;
  });

  // httpGetJson(url)
  if (api.httpGetJson) {
    setGlobal('httpGetJson', (Linner) => {
      const url = lua.lua_tojsstring(Linner, 1);
      api
        .httpGetJson?.(url)
        .then((result) => {
          api.log?.('[Lua httpGetJson] OK', result);
        })
        .catch((err) => {
          api.error?.('[Lua httpGetJson] failed', err instanceof Error ? err.message : String(err));
        });
      return 0;
    });
  }

  // writeTerminal(dsl)
  if (api.writeTerminal) {
    setGlobal('writeTerminal', (Linner) => {
      const dsl = lua.lua_tojsstring(Linner, 1);
      api.writeTerminal?.(dsl);
      return 0;
    });
  }

  // runGlobal(id, args?, callback?)
  if (api.runGlobal) {
    setGlobal('runGlobal', makeRunGlobal(L, api));
  }

  // getGlobalVar(key)
  if (api.getGlobalVar) {
    setGlobal('getGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      const v = api.getGlobalVar?.(key);
      const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      lua.lua_pushstring(Linner, to_luastring(s));
      return 1;
    });
  }

  // setGlobalVar(key, valueJsonOrString)
  if (api.setGlobalVar) {
    setGlobal('setGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      const raw = lua.lua_gettop(Linner) >= 2 ? lua.lua_tojsstring(Linner, 2) : '';
      const parsed = safeJsonParse(raw);
      api.setGlobalVar?.(key, parsed ?? raw);
      return 0;
    });
  }

  // deleteGlobalVar(key)
  if (api.deleteGlobalVar) {
    setGlobal('deleteGlobalVar', (Linner) => {
      const key = lua.lua_tojsstring(Linner, 1);
      api.deleteGlobalVar?.(key);
      return 0;
    });
  }

  // getNamedVar(name)
  if (api.getNamedVar) {
    setGlobal('getNamedVar', (Linner) => {
      const name = lua.lua_tojsstring(Linner, 1);
      const v = api.getNamedVar?.(name);
      lua.lua_pushstring(Linner, to_luastring(v ?? ''));
      return 1;
    });
  }

  // doAfter(delayMs, type, command)
  if (api.doAfter) {
    setGlobal('doAfter', (Linner) => {
      const delayMs = lua.lua_tonumber(Linner, 1) as number;
      const type = lua.lua_tojsstring(Linner, 2) as 'world' | 'alias';
      const command = lua.lua_tojsstring(Linner, 3);
      api.doAfter?.(delayMs, type, command);
      return 0;
    });
  }

  // global event
  pushJsValue(L, api.event ?? null);
  lua.lua_setglobal(L, to_luastring('event'));
}

function safeJsonParse(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The api each state is running under, innermost last. One state serves every script of a connection (see
 * globalRuntime), and a script can start another one synchronously (sendCommand -> alias -> Lua), so the
 * `api` / `event` globals the outer script sees must be put back when the inner one finishes.
 */
const apiStacks = new WeakMap<object, ScriptSandboxApi[]>();

/**
 * Close a state made by createLuaState, releasing its memory. Without this a state lives as long as anything
 * still references it, and every one-shot run would leave a whole Lua VM (all standard libraries) behind.
 */
export function closeLuaState(L: any): void {
  apiStacks.delete(L);
  closedStates.add(L);
  lua.lua_close(L);
}

/**
 * Run `body` with `api` bound into the state, then put the state back the way it was found: the previous
 * api rebound, and the value stack back to its starting height. A long-lived state keeps whatever a failed
 * load or pcall leaves on its stack (the error message), so without the reset it would grow on every error.
 */
function runWithApi<T>(L: any, api: ScriptSandboxApi, body: () => T): T {
  const top = lua.lua_gettop(L);
  let stack = apiStacks.get(L);
  if (!stack) {
    stack = [];
    apiStacks.set(L, stack);
  }
  stack.push(api);
  bindApiToLuaState(L, api);
  try {
    return body();
  } finally {
    stack.pop();
    const outer = stack[stack.length - 1];
    if (outer) bindApiToLuaState(L, outer);
    lua.lua_settop(L, top);
  }
}

/**
 * Execute a chunk of Lua source with a given ScriptSandboxApi. Globals and functions the chunk defines stay in
 * the state for later chunks.
 */
export function runLuaChunkInState(L: any, source: string, api: ScriptSandboxApi, chunkName?: string): boolean {
  return runWithApi(L, api, () => {
    // load Lua chunk
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(chunkName ?? 'user_script'));

    if (status !== lua.LUA_OK) {
      const errMsg = lua.lua_tojsstring(L, -1);
      api.error?.(`Lua load error: ${errMsg}`);
      return false;
    }

    // run chunk
    const callStatus = lua.lua_pcall(L, 0, 0, 0);
    if (callStatus !== lua.LUA_OK) {
      const errMsg = lua.lua_tojsstring(L, -1);
      api.error?.(`Lua runtime error: ${errMsg}`);
      return false;
    }

    return true;
  });
}

/**
 * Call a global Lua function by name, passing args as JSON-stringified text, and report what it returned as plain
 * data. Convention:
 *   function foo(argsJson) ... return value end
 */
export function callLuaGlobalFunctionWithResult(
  L: any,
  funcName: string,
  args: unknown,
  api: ScriptSandboxApi,
): { ok: boolean; value?: unknown; error?: string } {
  // Rebinds the api so runGlobal/getGlobalVar/etc. act for this caller.
  return runWithApi(L, api, () => {
    lua.lua_getglobal(L, to_luastring(funcName));

    if (!lua.lua_isfunction(L, -1)) {
      const error = `function not found: ${funcName}`;
      api.error?.(`[Lua global] ${error}`);
      return { ok: false, error };
    }

    const argsJson = args === undefined ? '' : JSON.stringify(args);
    lua.lua_pushstring(L, to_luastring(argsJson));

    const callStatus = lua.lua_pcall(L, 1, 1, 0);
    if (callStatus !== lua.LUA_OK) {
      const errMsg = lua.lua_tojsstring(L, -1);
      api.error?.(`Lua global call error (${funcName}): ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    return { ok: true, value: luaToJs(L, -1) };
  });
}

/** Call a global Lua function by name; true when it ran without error. */
export function callLuaGlobalFunctionInState(L: any, funcName: string, args: unknown, api: ScriptSandboxApi): boolean {
  return callLuaGlobalFunctionWithResult(L, funcName, args, api).ok;
}

/**
 * Execute a chunk of Lua source in a state of its own, closed afterwards. For callers that must NOT share the
 * user's script engine (plugin-bundled scripts); user scripts go through globalRuntime's per-connection engine.
 */
export function runLuaSourceInBrowser(source: string, api: ScriptSandboxApi): void {
  const L = createLuaState();
  try {
    runLuaChunkInState(L, source, api, 'user_script');
  } finally {
    closeLuaState(L);
  }
}

/**
 * Optional global init (you may still be using this elsewhere).
 */
export function initBrowserLuaRunner() {
  const w = window as unknown as {
    __dslLuaRunner?: (source: string, api: ScriptSandboxApi) => void;
  };

  if (!w.__dslLuaRunner) {
    w.__dslLuaRunner = (source: string, api: ScriptSandboxApi) => {
      runLuaSourceInBrowser(source, api);
    };
  }
}
