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
function createLuaState(): any {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  return L;
}

/**
 * Bridge ScriptSandboxApi into Lua as:
 *   - global table: api.log, api.error, api.sendCommand, api.httpGetJson, api.writeTerminal
 *   - global fns:  log(...), error(...), sendCommand(...), httpGetJson(...), writeTerminal(...)
 */
function pushApiAndGlobals(L: any, api: ScriptSandboxApi) {
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
}

/**
 * Execute a chunk of Lua source with a given ScriptSandboxApi.
 */
export function runLuaSourceInBrowser(source: string, api: ScriptSandboxApi): void {
  const L = createLuaState();

  // bridge JS api into Lua
  pushApiAndGlobals(L, api);

  // load Lua chunk
  const status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring('user_script'));

  if (status !== lua.LUA_OK) {
    const errMsg = lua.lua_tojsstring(L, -1);
    api.error?.(`Lua load error: ${errMsg}`);
    return;
  }

  // run chunk
  const callStatus = lua.lua_pcall(L, 0, 0, 0);
  if (callStatus !== lua.LUA_OK) {
    const errMsg = lua.lua_tojsstring(L, -1);
    api.error?.(`Lua runtime error: ${errMsg}`);
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
