import { lua, lauxlib, lualib, to_luastring } from 'fengari-web';
import Sk from 'skulpt';
import { runUserScript } from './runtime';
import { invalidateGlobalRuntime, invokeGlobalById } from './globalRuntime';
import { setGlobalScriptSource } from './globalScriptsStore';
import { runPythonSourceInBrowser } from './pythonRuntime';
import {
  createLuaState,
  closeLuaState,
  runLuaChunkInState,
  runLuaSourceInBrowser,
  callLuaGlobalFunctionInState,
} from './luaRuntime';
import type { AliasScript, ScriptSandboxApi, UserScriptLanguage } from './types';

// Lua and Python are ONE engine per language per connection: the Globals source and every trigger / alias / timer
// script of that connection run in the same interpreter, so a function or variable defined anywhere is visible
// everywhere. These run the real fengari VM and the real Skulpt.

let nextConn = 0;
/** A connection id no other test touched, so engines and stored Globals never leak between tests. */
function freshConnection(): string {
  nextConn += 1;
  return `engine-test-${nextConn}:1`;
}

function recorder(extra: Partial<ScriptSandboxApi> = {}) {
  const sent: string[] = [];
  const logged: unknown[][] = [];
  const errors: unknown[][] = [];
  const api: ScriptSandboxApi = {
    sendCommand: (cmd: string) => void sent.push(cmd),
    log: (...args: unknown[]) => void logged.push(args),
    error: (...args: unknown[]) => void errors.push(args),
    ...extra,
  };
  return { api, sent, logged, errors };
}

/** Python source that reports whether a module-level name exists (dir() is not reliable in Skulpt). */
function ifDefined(name: string, yes: string, no: string): string {
  return ['try:', `    ${name}`, `    sendCommand("${yes}")`, 'except NameError:', `    sendCommand("${no}")`].join('\n');
}

function script(language: UserScriptLanguage, source: string): AliasScript {
  return { id: `s-${Math.random()}`, kind: 'alias', name: 'test', enabled: true, language, source, alias: 'x' };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Lua engine', () => {
  it('lets a script call a function defined by the Globals source, without runGlobal', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_flee(dir) sendCommand("flee " .. dir) end');
    const r = recorder();

    await runUserScript(script('lua', 'core_flee("north")'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['flee north']);
  });

  it('keeps variables a script sets for the scripts that run after it', async () => {
    const conn = freshConnection();
    const r = recorder();

    await runUserScript(script('lua', 'kills = (kills or 0) + 1'), r.api, conn);
    await runUserScript(script('lua', 'kills = kills + 1; sendCommand("kills " .. kills)'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['kills 2']);
  });

  it('shares one state between runGlobal and the scripts', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'calls = 0\nfunction core_hit(args) calls = calls + 1 end');
    const r = recorder();

    await invokeGlobalById(conn, 'global.lua.core.hit', r.api);
    await invokeGlobalById(conn, 'global.lua.core.hit', r.api);
    await runUserScript(script('lua', 'sendCommand("calls " .. calls)'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['calls 2']);
  });

  it('gives every run its own event, and nil when there is none', async () => {
    const conn = freshConnection();
    const r = recorder();
    const withEvent = { ...r.api, event: { name: 'alias:input', payload: { text: 'hi' } } };

    await runUserScript(script('lua', 'sendCommand(event.payload.text)'), withEvent, conn);
    await runUserScript(script('lua', 'sendCommand(event == nil and "no event" or "stale event")'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['hi', 'no event']);
  });

  it('restarts the engine when the Globals source changes, dropping what the old one defined', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function old_fn() sendCommand("old") end');
    const r = recorder();
    await runUserScript(script('lua', 'hits = 1\nold_fn()'), r.api, conn);

    const close = jest.spyOn(lua, 'lua_close');
    setGlobalScriptSource(conn, 'lua', 'function new_fn() sendCommand("new") end');
    await runUserScript(script('lua', 'new_fn()\nsendCommand(old_fn == nil and "old gone" or "old kept")\nsendCommand(hits == nil and "state reset" or "state kept")'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['old', 'new', 'old gone', 'state reset']);
    expect(close).toHaveBeenCalledTimes(1); // the replaced VM is released, not just forgotten
    close.mockRestore();
  });

  it('closes the engine when the Globals runtime is invalidated, and starts a fresh one on next use', async () => {
    const conn = freshConnection();
    const r = recorder();
    await runUserScript(script('lua', 'marker = 1'), r.api, conn);

    const close = jest.spyOn(lua, 'lua_close');
    invalidateGlobalRuntime(conn, 'lua');
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();

    await runUserScript(script('lua', 'sendCommand(marker == nil and "fresh" or "old")'), r.api, conn);
    expect(r.sent).toEqual(['fresh']);
  });

  it('invalidating a connection that never ran Lua does nothing', () => {
    const close = jest.spyOn(lua, 'lua_close');
    invalidateGlobalRuntime(freshConnection());
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it('keeps connections apart', async () => {
    const a = freshConnection();
    const b = freshConnection();
    const r = recorder();

    await runUserScript(script('lua', 'secret = "a-only"'), r.api, a);
    await runUserScript(script('lua', 'sendCommand(secret == nil and "isolated" or secret)'), r.api, b);

    expect(r.sent).toEqual(['isolated']);
  });

  it('reports a failing script and keeps the engine usable', async () => {
    const conn = freshConnection();
    const r = recorder();

    await runUserScript(script('lua', 'this is not lua'), r.api, conn);
    await runUserScript(script('lua', 'error_here = nil + 1'), r.api, conn);
    await runUserScript(script('lua', 'sendCommand("still alive")'), r.api, conn);

    expect(r.errors.map((e) => String(e[0]))).toEqual([
      expect.stringContaining('Lua load error'),
      expect.stringContaining('Lua runtime error'),
    ]);
    expect(r.sent).toEqual(['still alive']);
  });

  it('reports a Globals source that fails to load once, and still runs the scripts', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function broken(');
    const r = recorder();

    await runUserScript(script('lua', 'sendCommand("ran")'), r.api, conn);
    await runUserScript(script('lua', 'sendCommand("ran again")'), r.api, conn);

    expect(r.sent).toEqual(['ran', 'ran again']);
    expect(r.errors).toHaveLength(1);
    expect(String(r.errors[0][0])).toContain('Lua load error');
  });

  it('puts the outer script api and event back after a script it started finishes', async () => {
    const conn = freshConnection();
    const outer = recorder({ event: { name: 'outer', payload: {} } });
    const inner = recorder({ event: { name: 'inner', payload: {} } });

    // sendCommand from the outer script synchronously runs another script in the same state.
    outer.api.sendCommand = (cmd: string) => {
      outer.sent.push(cmd);
      void runUserScript(script('lua', 'sendCommand("from inner " .. event.name)'), inner.api, conn);
    };

    await runUserScript(script('lua', 'sendCommand("first")\nsendCommand("event is " .. event.name)'), outer.api, conn);

    expect(inner.sent).toEqual(['from inner inner', 'from inner inner']);
    // Without the restore, the second line would have seen event.name == "inner" and sent through the inner api.
    expect(outer.sent).toEqual(['first', 'event is outer']);
  });

  it('leaves the value stack where it found it, even after failures', () => {
    const L = createLuaState();
    const { api } = recorder();

    for (let i = 0; i < 5; i++) {
      runLuaChunkInState(L, 'syntax error here', api);
      runLuaChunkInState(L, 'local x = nil; return x.y', api);
      runLuaChunkInState(L, 'x = 1', api);
    }

    expect(lua.lua_gettop(L)).toBe(0);
    closeLuaState(L);
  });

  it('still reports a missing global function and leaves the stack clean', () => {
    const L = createLuaState();
    const r = recorder();

    expect(callLuaGlobalFunctionInState(L, 'nope', undefined, r.api)).toBe(false);
    expect(String(r.errors[0][0])).toContain('function not found');

    // (not error("bang"): scripts' error() is the bridge's logger, which replaces Lua's raising one)
    runLuaChunkInState(L, 'function boom() return nil + 1 end', r.api);
    expect(callLuaGlobalFunctionInState(L, 'boom', undefined, r.api)).toBe(false);
    expect(String(r.errors[1][0])).toContain('Lua global call error');
    expect(lua.lua_gettop(L)).toBe(0);
    closeLuaState(L);
  });

  it('runs a script with no connection in a state of its own and closes it', async () => {
    const r = recorder();
    const close = jest.spyOn(lua, 'lua_close');

    await runUserScript(script('lua', 'leak = 1\nsendCommand("ran")'), r.api);
    await runUserScript(script('lua', 'sendCommand(leak == nil and "nothing left" or "leaked")'), r.api);

    expect(r.sent).toEqual(['ran', 'nothing left']);
    expect(close).toHaveBeenCalledTimes(2);
    close.mockRestore();
  });

  it('closes the one-shot state even when the script fails', () => {
    const r = recorder();
    const close = jest.spyOn(lua, 'lua_close');

    runLuaSourceInBrowser('not lua at all', r.api);

    expect(r.errors).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });

  it('does not touch the user engine when a one-shot script runs', async () => {
    const conn = freshConnection();
    const r = recorder();
    await runUserScript(script('lua', 'mine = 1'), r.api, conn);

    runLuaSourceInBrowser('mine = 2', r.api);

    await runUserScript(script('lua', 'sendCommand("mine " .. mine)'), r.api, conn);
    expect(r.sent).toEqual(['mine 1']);
  });

  it('is a real VM (sanity check on the harness)', () => {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    lauxlib.luaL_loadbuffer(L, to_luastring('return 6 * 7'), null, to_luastring('t'));
    lua.lua_pcall(L, 0, 1, 0);
    expect(lua.lua_tonumber(L, -1)).toBe(42);
    lua.lua_close(L);
  });
});

describe('Python engine', () => {
  it('lets a script call a function defined by the Globals source, without runGlobal', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'def core_flee(d):\n    sendCommand("flee " + d)\n');
    const r = recorder();

    await runUserScript(script('python', 'core_flee("north")'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['flee north']);
  });

  it('keeps variables a script sets for the scripts that run after it', async () => {
    const conn = freshConnection();
    const r = recorder();

    await runUserScript(script('python', 'kills = 1'), r.api, conn);
    await runUserScript(script('python', 'kills += 1\nsendCommand("kills %d" % kills)'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['kills 2']);
  });

  it('runs the same source again against the same namespace (compiled once)', async () => {
    const conn = freshConnection();
    const r = recorder();
    const counter = script('python', 'try:\n    n += 1\nexcept NameError:\n    n = 1\nsendCommand("n=%d" % n)');

    await runUserScript(counter, r.api, conn);
    await runUserScript(counter, r.api, conn);
    await runUserScript(counter, r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['n=1', 'n=2', 'n=3']);
  });

  it('keeps the same compiled source independent between namespaces', async () => {
    const a = freshConnection();
    const b = freshConnection();
    const r = recorder();
    const bump = script('python', 'try:\n    n += 1\nexcept NameError:\n    n = 1\nsendCommand("n=%d" % n)');

    await runUserScript(bump, r.api, a);
    await runUserScript(bump, r.api, a);
    await runUserScript(bump, r.api, b);
    await runUserScript(bump, r.api);

    expect(r.sent).toEqual(['n=1', 'n=2', 'n=1', 'n=1']);
  });

  it('still compiles correctly after the compiled-source cache fills and is cleared', async () => {
    const conn = freshConnection();
    const r = recorder();

    for (let i = 0; i < 105; i++) {
      await runUserScript(script('python', `v${i} = ${i}`), r.api, conn);
    }
    await runUserScript(script('python', 'v0 = 0\nsendCommand("v0 %d v104 %d" % (v0, v104))'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['v0 0 v104 104']);
  });

  it('shares one namespace between runGlobal and the scripts', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'calls = 0\ndef core_hit(args):\n    global calls\n    calls += 1\n');
    const r = recorder();

    await invokeGlobalById(conn, 'global.python.core.hit', r.api);
    await invokeGlobalById(conn, 'global.python.core.hit', r.api);
    await runUserScript(script('python', 'sendCommand("calls %d" % calls)'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['calls 2']);
  });

  it('gives every run its own event, and None when there is none', async () => {
    const conn = freshConnection();
    const r = recorder();
    const withEvent = { ...r.api, event: { name: 'alias:input', payload: { text: 'hi' } } };

    await runUserScript(script('python', 'sendCommand(event["payload"]["text"])'), withEvent, conn);
    await runUserScript(script('python', 'sendCommand("no event" if event is None else "stale event")'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['hi', 'no event']);
  });

  it('restarts the engine when the Globals source changes, dropping what the old one defined', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'def old_fn():\n    sendCommand("old")\n');
    const r = recorder();
    await runUserScript(script('python', 'hits = 1\nold_fn()'), r.api, conn);

    setGlobalScriptSource(conn, 'python', 'def new_fn():\n    sendCommand("new")\n');
    await runUserScript(
      script(
        'python',
        [
          'new_fn()',
          'try:',
          '    old_fn()',
          '    sendCommand("old kept")',
          'except NameError:',
          '    sendCommand("old gone")',
          'try:',
          '    hits',
          '    sendCommand("state kept")',
          'except NameError:',
          '    sendCommand("state reset")',
        ].join('\n'),
      ),
      r.api,
      conn,
    );

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['old', 'new', 'old gone', 'state reset']);
  });

  it('forgets the engine when the Globals runtime is invalidated', async () => {
    const conn = freshConnection();
    const r = recorder();
    await runUserScript(script('python', 'marker = 1'), r.api, conn);

    invalidateGlobalRuntime(conn, 'python');

    await runUserScript(script('python', ifDefined('marker', 'old', 'fresh')), r.api, conn);
    expect(r.sent).toEqual(['fresh']);
  });

  it('reports a global function that raises, once, and resolves undefined', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'def core_boom(args):\n    return 1 / 0\n');
    const r = recorder();

    await expect(invokeGlobalById(conn, 'global.python.core.boom', r.api)).resolves.toBeUndefined();

    expect(r.errors).toHaveLength(1);
    expect(String(r.errors[0][0])).toContain('call module function error');
    expect(String(r.errors[0][0])).toContain('core_boom');
  });

  it('uses an empty engine, and drops a stale one, when the Globals source is blank', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'def gone():\n    sendCommand("still here")\n');
    const r = recorder();
    await runUserScript(script('python', 'gone()'), r.api, conn);

    setGlobalScriptSource(conn, 'python', '   ');
    await runUserScript(script('python', 'gone()'), r.api, conn);

    expect(r.sent).toEqual(['still here']);
    expect(r.errors).toHaveLength(1);
    expect(String(r.errors[0][0])).toContain('gone');
  });

  it('keeps connections apart', async () => {
    const a = freshConnection();
    const b = freshConnection();
    const r = recorder();

    await runUserScript(script('python', 'secret = "a-only"'), r.api, a);
    await runUserScript(script('python', ifDefined('secret', 'leaked', 'isolated')), r.api, b);

    expect(r.sent).toEqual(['isolated']);
  });

  it('runs a script with no connection in a namespace of its own', async () => {
    const conn = freshConnection();
    const r = recorder();
    await runUserScript(script('python', 'mine = 1'), r.api, conn);

    await runPythonSourceInBrowser('mine = 2\nleak = 1', r.api);
    await runUserScript(script('python', ifDefined('leak', 'leaked', 'clean') + '\nsendCommand("mine %d" % mine)'), r.api, conn);

    expect(r.sent).toEqual(['clean', 'mine 1']);
  });

  it('reports a failing script and keeps the engine usable', async () => {
    const conn = freshConnection();
    const r = recorder();

    await runUserScript(script('python', 'def (:'), r.api, conn);
    await runUserScript(script('python', 'undefined_name + 1'), r.api, conn);
    await runUserScript(script('python', 'sendCommand("still alive")'), r.api, conn);

    expect(r.errors).toHaveLength(2);
    expect(r.sent).toEqual(['still alive']);
  });

  it('reports a Globals source that fails to load once, and still runs the scripts', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'def broken(:\n');
    const r = recorder();

    await runUserScript(script('python', 'sendCommand("ran")'), r.api, conn);
    await runUserScript(script('python', 'sendCommand("ran again")'), r.api, conn);

    expect(r.sent).toEqual(['ran', 'ran again']);
    const loadErrors = r.errors.filter((e) => String(e[0]).includes('load module error'));
    expect(loadErrors).toHaveLength(1);
  });

  it('loads the Globals source once when two scripts arrive together', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'import time\ntime.sleep(0.02)\nsendCommand("globals loaded")\ndef shout(w):\n    sendCommand("shout " + w)\n');
    const r = recorder();

    await Promise.all([
      runUserScript(script('python', 'shout("a")'), r.api, conn),
      runUserScript(script('python', 'shout("b")'), r.api, conn),
    ]);

    // The second script must wait for the first one's load, not run against a half-built namespace.
    expect(r.errors).toEqual([]);
    expect(r.sent.filter((c) => c === 'globals loaded')).toHaveLength(1);
    expect(r.sent.filter((c) => c.startsWith('shout')).sort()).toEqual(['shout a', 'shout b']);
  });

  it('compiles a repeated source once', async () => {
    const compile = jest.spyOn(Sk as unknown as { compile: () => unknown }, 'compile');
    const conn = freshConnection();
    const r = recorder();
    const same = script('python', 'tick_count = 1');

    await runUserScript(same, r.api, conn);
    await runUserScript(same, r.api, conn);
    await runUserScript(same, r.api);

    expect(compile).toHaveBeenCalledTimes(1);
    compile.mockRestore();
  });

  it('lets two runs of the same source suspend at once and each finish', async () => {
    const conn = freshConnection();
    const r = recorder();
    const sleepy = script('python', 'import time\ntime.sleep(0.01)\nsendCommand("done")');

    await Promise.all([runUserScript(sleepy, r.api, conn), runUserScript(sleepy, r.api, conn)]);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['done', 'done']);
  });

  it('routes print() to the api of the run in progress', async () => {
    const conn = freshConnection();
    const a = recorder();
    const b = recorder();

    await runUserScript(script('python', 'print("to a")'), a.api, conn);
    await runUserScript(script('python', 'print("to b")'), b.api, conn);

    expect(a.logged.flat().join('')).toContain('to a');
    expect(a.logged.flat().join('')).not.toContain('to b');
    expect(b.logged.flat().join('')).toContain('to b');
  });

  it('does not leave an optional bridge function from an earlier run for a run whose api lacks it', async () => {
    const conn = freshConnection();
    const withVars = recorder({ getNamedVar: () => 'x' });
    const without = recorder();

    await runUserScript(script('python', 'sendCommand(getNamedVar("T"))'), withVars.api, conn);
    await runUserScript(script('python', 'getNamedVar("T")'), without.api, conn);

    expect(withVars.sent).toEqual(['x']);
    expect(without.errors).toHaveLength(1);
    expect(String(without.errors[0][0])).toContain('getNamedVar');
  });

  it('rebinds the bridge for the run still in progress when an overlapping one finishes first', async () => {
    const conn = freshConnection();
    const slow = recorder();
    const quick = recorder();

    const first = runUserScript(script('python', 'import time\ntime.sleep(0.03)\nsendCommand("slow done")'), slow.api, conn);
    const second = runUserScript(script('python', 'sendCommand("quick done")'), quick.api, conn);
    await Promise.all([first, second]);

    expect(slow.errors).toEqual([]);
    expect(quick.sent).toEqual(['quick done']);
    expect(slow.sent).toEqual(['slow done']);
  });
});
