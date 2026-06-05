// apps/game-client/src/features/userScripts/luaRuntime.ts
import type { ScriptSandboxApi } from './types';
import { lua, lauxlib, lualib, to_luastring } from 'fengari-web';

/**
 * Push a JS function onto the Lua stack as a C function.
 */
function pushJsFunction(L: any, fn: (Linner: any) => number) {
  lua.lua_pushcfunction(L, fn);
}

/**
 * Create a fresh Lua state with standard libs opened.
 */
export function createLuaState(): any {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  return L;
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

  // api.runGlobal(id, argsJson?)
  if (api.runGlobal) {
    setApiField('runGlobal', (Linner) => {
      const id = lua.lua_tojsstring(Linner, 1);
      const argsJson = lua.lua_gettop(Linner) >= 2 ? lua.lua_tojsstring(Linner, 2) : undefined;

      api
        .runGlobal?.(id, argsJson ? safeJsonParse(argsJson) : undefined)
        .then((res) => {
          api.log?.('[Lua runGlobal] OK', res);
        })
        .catch((err) => {
          api.error?.('[Lua runGlobal] failed', err instanceof Error ? err.message : String(err));
        });

      return 0;
    });
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

  // runGlobal(id, argsJson?)
  if (api.runGlobal) {
    setGlobal('runGlobal', (Linner) => {
      const id = lua.lua_tojsstring(Linner, 1);
      const argsJson = lua.lua_gettop(Linner) >= 2 ? lua.lua_tojsstring(Linner, 2) : undefined;

      api
        .runGlobal?.(id, argsJson ? safeJsonParse(argsJson) : undefined)
        .then((res) => {
          api.log?.('[Lua runGlobal] OK', res);
        })
        .catch((err) => {
          api.error?.('[Lua runGlobal] failed', err instanceof Error ? err.message : String(err));
        });

      return 0;
    });
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
 * Execute a chunk of Lua source with a given ScriptSandboxApi.
 */
export function runLuaChunkInState(L: any, source: string, api: ScriptSandboxApi, chunkName?: string): boolean {
  // bridge JS api into Lua (rebind each run to ensure current api/connection is used)
  bindApiToLuaState(L, api);

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
}

/**
 * Call a global Lua function by name, passing args as JSON-stringified text.
 * Convention:
 *   function foo(argsJson) ... end
 */
export function callLuaGlobalFunctionInState(L: any, funcName: string, args: unknown, api: ScriptSandboxApi): boolean {
  // Rebind api to update runGlobal/getGlobalVar/etc functions.
  bindApiToLuaState(L, api);

  lua.lua_getglobal(L, to_luastring(funcName));

  if (!lua.lua_isfunction(L, -1)) {
    api.error?.(`[Lua global] function not found: ${funcName}`);
    lua.lua_pop(L, 1);
    return false;
  }

  const argsJson = args === undefined ? '' : JSON.stringify(args);
  lua.lua_pushstring(L, to_luastring(argsJson));

  const callStatus = lua.lua_pcall(L, 1, 0, 0);
  if (callStatus !== lua.LUA_OK) {
    const errMsg = lua.lua_tojsstring(L, -1);
    api.error?.(`Lua global call error (${funcName}): ${errMsg}`);
    return false;
  }

  return true;
}

/**
 * Execute a chunk of Lua source with a given ScriptSandboxApi.
 */
export function runLuaSourceInBrowser(source: string, api: ScriptSandboxApi): void {
  const L = createLuaState();

  runLuaChunkInState(L, source, api, 'user_script');
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
