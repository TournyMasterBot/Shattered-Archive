import { runUserScript } from './runtime';
import { invokeGlobalById, invokeGlobalSync, getJsGlobalScope, invalidateGlobalRuntime } from './globalRuntime';
import { setGlobalScriptSource } from './globalScriptsStore';
import { createLuaState, closeLuaState, luaToJs, runLuaChunkInState, callLuaGlobalFunctionWithResult } from './luaRuntime';
import { loadPythonModuleBody } from './pythonRuntime';
import { toPlainData } from './plainData';
import { lua, to_luastring, lauxlib } from 'fengari-web';
import type { AliasScript, ScriptSandboxApi, UserScriptLanguage } from './types';

// The invoke contract: a global written in any language (global.<language>.<path>) can be called from a script in
// any language. JS / TS scripts get the Globals exports as plain names; Lua and Python get runGlobal as an
// ordinary call that returns the value when the global finished at once, plus a callback for one that did not.
// Everything runs on the real fengari VM and the real Skulpt.

let nextConn = 0;
function freshConnection(): string {
  nextConn += 1;
  return `contract-test-${nextConn}:1`;
}

/** A recorder whose api is wired to the invoke contract for `conn`, as the real api builders do. */
function wired(conn: string, extra: Partial<ScriptSandboxApi> = {}) {
  const sent: string[] = [];
  const logged: unknown[][] = [];
  const errors: unknown[][] = [];
  const api: ScriptSandboxApi = {
    sendCommand: (cmd: string) => void sent.push(cmd),
    log: (...args: unknown[]) => void logged.push(args),
    error: (...args: unknown[]) => void errors.push(args),
    ...extra,
  };
  api.runGlobal = (id, args) => invokeGlobalById(conn, id, api, args);
  api.runGlobalNow = (id, args) => invokeGlobalSync(conn, id, api, args);
  return { api, sent, logged, errors };
}

function script(language: UserScriptLanguage, source: string): AliasScript {
  return { id: `s-${Math.random()}`, kind: 'alias', name: 'test', enabled: true, language, source, alias: 'x' };
}

const flush = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  localStorage.clear();
});

describe('JS / TS scripts call the Globals files by name', () => {
  it('calls a function by its bare name and gets its return value back at once', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'javascript',
      'exports.double = (n) => n * 2;\nexports.shout = (api, args) => { api.sendCommand("shout " + args.word); return "done"; };',
    );
    const r = wired(conn);

    await runUserScript(
      script('javascript', 'sendCommand("twice " + double(21)); sendCommand(shout({ word: "hey" }));'),
      r.api,
      conn,
    );

    expect(r.errors).toEqual([]);
    // (api, args) and (args) functions both work when simply called with the arguments
    expect(r.sent).toEqual(['twice 42', 'shout hey', 'done']);
  });

  it('reaches nested objects, with `this` pointing at the object a method hangs off', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'javascript',
      'exports.core = { name: "core", nested: { deep: { hello() { return "hi from " + this.label; }, label: "deep" } } };',
    );
    const r = wired(conn);

    await runUserScript(script('javascript', 'sendCommand(core.nested.deep.hello()); sendCommand(core.name);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['hi from deep', 'core']);
  });

  it('writes through to the Globals module state, so scripts and Globals share one program', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'javascript',
      'exports.state = { kills: 0 };\nexports.hit = () => ++exports.state.kills;\nexports.list = [];',
    );
    const r = wired(conn);

    await runUserScript(script('javascript', 'state.kills = 5; list.push("a"); sendCommand("hit " + hit());'), r.api, conn);
    await runUserScript(script('javascript', 'sendCommand("kills " + state.kills + " list " + list.length);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['hit 6', 'kills 6 list 1']);
  });

  it('lets a script declare its own const with the name of a Globals export', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.core = { v: "from globals" };');
    const r = wired(conn);

    await runUserScript(script('javascript', 'const core = { v: "mine" }; sendCommand(core.v);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['mine']);
  });

  it('gives alias {variables} priority over a Globals export of the same name', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.TARGET = "from globals";');
    const r = wired(conn);
    const withVars = { ...r.api, event: { name: 'shatteredarchive:alias-fired', payload: { vars: { TARGET: 'orc' } } } };

    await runUserScript(script('javascript', 'sendCommand(TARGET);'), withVars, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['orc']);
  });

  it('shows a TS script the TS and the JS files, and the script\'s own language wins a clash', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.who = () => "js"; exports.onlyJs = () => "only js";');
    setGlobalScriptSource(conn, 'typescript', 'exports.who = (): string => "ts"; exports.onlyTs = (): string => "only ts";');
    const r = wired(conn);

    await runUserScript(
      script('typescript', 'const a: string = who(); sendCommand(a + " " + onlyJs() + " " + onlyTs());'),
      r.api,
      conn,
    );
    await runUserScript(script('javascript', 'sendCommand(who() + " " + onlyJs() + " " + onlyTs());'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['ts only js only ts', 'js only js only ts']);
  });

  it('leaves out an export named like a bridge function, a keyword or a non-identifier', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'javascript',
      'exports.log = () => { throw new Error("shadowed the bridge") };\nexports.class = 1;\nexports["my-fn"] = () => 1;\nexports.valid = () => "ok";',
    );
    const r = wired(conn);

    await runUserScript(script('javascript', 'log("fine"); sendCommand(valid());'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.logged).toEqual([['fine']]);
    expect(r.sent).toEqual(['ok']);
  });

  it('follows the Globals file: an edit changes the names available', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.first = () => "one";');
    const r = wired(conn);
    await runUserScript(script('javascript', 'sendCommand(first());'), r.api, conn);

    setGlobalScriptSource(conn, 'javascript', 'exports.second = () => "two";');
    await runUserScript(script('javascript', 'sendCommand(typeof first + " " + second());'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['one', 'undefined two']);
  });

  it('gives a script with no connection (a plugin script) none of the user\'s Globals', async () => {
    // The default connection is where a missing id would resolve to, so put the Globals there.
    setGlobalScriptSource('dsl-mud', 'javascript', 'exports.secret = () => "leak";');
    const r = wired('dsl-mud');

    await runUserScript(script('javascript', 'sendCommand(typeof secret);'), r.api);
    await runUserScript(script('javascript', 'sendCommand(typeof secret);'), r.api, 'dsl-mud');
    invalidateGlobalRuntime('dsl-mud');

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['undefined', 'function']);
  });

  it('passes a frozen export through as it is', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.cfg = Object.freeze({ inner: { a: 1 }, n: 2 });');
    const r = wired(conn);

    await runUserScript(script('javascript', 'sendCommand(cfg.n + " " + cfg.inner.a);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['2 1']);
  });

  it('hands back a promise from an async Globals function, which the script can await', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = (n) => new Promise((res) => setTimeout(() => res(n + 1), 10));');
    const r = wired(conn);

    await runUserScript(script('javascript', 'const v = await later(41); sendCommand("later " + v);'), r.api, conn);
    await runUserScript(script('typescript', 'const v: number = await later(1); sendCommand("ts later " + v);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['later 42', 'ts later 2']);
  });

  it('supports top-level await in JS and TS scripts (the docs have always shown it)', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_val(a) return 7 end');
    const r = wired(conn);

    await runUserScript(script('javascript', 'const v = await runGlobal("global.lua.core.val"); sendCommand("js " + v);'), r.api, conn);
    await runUserScript(script('typescript', 'const v: unknown = await runGlobal("global.lua.core.val"); sendCommand("ts " + v);'), r.api, conn);

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['js 7', 'ts 7']);
  });

  it('still reports a runtime error and a syntax error in a script', async () => {
    const conn = freshConnection();
    const r = wired(conn);

    await runUserScript(script('javascript', 'throw new Error("boom");'), r.api, conn);
    await runUserScript(script('javascript', 'this is not javascript'), r.api, conn);

    expect(r.errors).toHaveLength(2);
    expect(String(r.errors[0].join(' '))).toContain('boom');
  });

  it('exposes the scope directly, without wrapping a non-container export', () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.n = 3; exports.d = new Date(0); exports.when = Date.now;');
    const r = wired(conn);

    const scope = getJsGlobalScope(conn, r.api, 'javascript', new Set());

    expect(scope.n).toBe(3);
    expect(scope.d).toBeInstanceOf(Date);
    expect(typeof scope.when).toBe('function');
  });
});

describe('scripts that never use any of this behave as they always did', () => {
  it('starts every script in the turn it was triggered in, up to its first await', async () => {
    const conn = freshConnection();
    const r = wired(conn);

    void runUserScript(script('javascript', 'sendCommand("js first"); await Promise.resolve(); sendCommand("js second");'), r.api, conn);
    void runUserScript(script('typescript', 'sendCommand("ts first"); await Promise.resolve(); sendCommand("ts second");'), r.api, conn);
    void runUserScript(script('lua', 'sendCommand("lua first")'), r.api, conn);
    void runUserScript(script('python', 'sendCommand("py first")'), r.api, conn);

    // nothing awaited yet: each script has already run to its first await
    expect(r.sent).toEqual(['js first', 'ts first', 'lua first', 'py first']);

    await flush();
    expect(r.sent).toEqual(['js first', 'ts first', 'lua first', 'py first', 'js second', 'ts second']);
  });

  it('keeps runGlobal("...") working as a plain statement in every language', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_say(a) sendCommand("lua says " .. a) end');
    setGlobalScriptSource(conn, 'python', 'def core_say(a):\n    sendCommand("py says " + a)\n');
    setGlobalScriptSource(conn, 'javascript', 'exports.core = { say(api, a) { api.sendCommand("js says " + a); } };');
    const r = wired(conn);

    await runUserScript(
      script(
        'lua',
        'runGlobal("global.lua.core.say", "{\\"x\\":1}")\nrunGlobal("global.python.core.say", "plain")\nrunGlobal("global.javascript.core.say", "plain")',
      ),
      r.api,
      conn,
    );
    await flush();

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['lua says {"x":1}', 'py says plain', 'js says plain']);
    // with no callback the outcome is only logged, as it always was
    expect(r.logged.map((l) => l[0])).toEqual(['[Lua runGlobal] OK', '[Lua runGlobal] OK', '[Lua runGlobal] OK']);
  });

  it('logs a failed statement-form runGlobal as an error', async () => {
    const conn = freshConnection();
    const r = wired(conn);

    await runUserScript(script('lua', 'runGlobal("global.lua.missing")'), r.api, conn);
    await runUserScript(script('python', 'runGlobal("global.python.missing")'), r.api, conn);
    await flush();

    expect(r.errors.map((e) => String(e[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('[Lua runGlobal] failed'), expect.stringContaining('[Python runGlobal] failed')]),
    );
  });
});

describe('the value a global returns', () => {
  it('comes back as plain data from a JS global, with functions and cycles dropped', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'javascript',
      'exports.data = () => ({ a: 1, list: [1, "b", null], f() {}, when: new Date(0) });\nexports.cyc = () => { const o = {}; o.self = o; return o; };\nexports.nothing = () => {};',
    );
    const r = wired(conn);

    expect(await invokeGlobalById(conn, 'global.javascript.data', r.api)).toEqual({ a: 1, list: [1, 'b', null], when: '1970-01-01T00:00:00.000Z' });
    expect(await invokeGlobalById(conn, 'global.javascript.cyc', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'global.javascript.nothing', r.api)).toBeUndefined();
  });

  it('comes back as plain data from a Lua global: lists, dicts, nesting, nil', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'lua',
      [
        'function core_num() return 42 end',
        'function core_str() return "hello" end',
        'function core_bool() return true end',
        'function core_nil() return nil end',
        'function core_list() return {10, 20, 30} end',
        'function core_dict() return {a = 1, b = {c = "x", d = {true, false}}} end',
        'function core_empty() return {} end',
        'function core_mixed() return {1, 2, x = 3} end',
        'function core_holes() local t = {}; t[1] = "a"; t[3] = "c"; return t end',
        'function core_fn() return function() end end',
        'function core_cycle() local t = {}; t.self = t; return t end',
        'function core_args(json) return json end',
      ].join('\n'),
    );
    const r = wired(conn);
    const call = (name: string, args?: unknown) => invokeGlobalById(conn, `global.lua.core.${name}`, r.api, args);

    expect(await call('num')).toBe(42);
    expect(await call('str')).toBe('hello');
    expect(await call('bool')).toBe(true);
    expect(await call('nil')).toBeUndefined();
    expect(await call('list')).toEqual([10, 20, 30]);
    expect(await call('dict')).toEqual({ a: 1, b: { c: 'x', d: [true, false] } });
    expect(await call('empty')).toEqual([]);
    expect(await call('mixed')).toEqual({ '1': 1, '2': 2, x: 3 });
    expect(await call('holes')).toEqual({ '1': 'a', '3': 'c' });
    expect(await call('fn')).toBeUndefined();
    expect(await call('args', { n: 5 })).toBe('{"n":5}'); // a Lua global still receives its arguments as a JSON string
    // a table that contains itself stops at the depth limit instead of looping
    expect(JSON.stringify(await call('cycle')).length).toBeLessThan(2000);
  });

  it('comes back as plain data from a Python global', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(
      conn,
      'python',
      [
        'def core_num(a):',
        '    return 42',
        'def core_str(a):',
        '    return "hello"',
        'def core_none(a):',
        '    return None',
        'def core_nothing(a):',
        '    pass',
        'def core_dict(a):',
        '    return {"a": [1, 2], "b": None, "c": {"d": True}}',
        'def core_tuple(a):',
        '    return (1, "two")',
        'def core_echo(a):',
        '    return a',
        'def core_func(a):',
        '    return len',
        'def core_fdict(a):',
        '    return {"a": 1, "f": len}',
      ].join('\n') + '\n',
    );
    const r = wired(conn);
    const call = (name: string, args?: unknown) => invokeGlobalById(conn, `global.python.core.${name}`, r.api, args);

    expect(await call('num')).toBe(42);
    expect(await call('str')).toBe('hello');
    expect(await call('none')).toBeNull();
    expect(await call('nothing')).toBeNull();
    expect(await call('dict')).toEqual({ a: [1, 2], b: null, c: { d: true } });
    expect(await call('tuple')).toEqual([1, 'two']);
    expect(await call('echo', { k: [1, 2] })).toEqual({ k: [1, 2] });
    expect(await call('func')).toBeUndefined();
    expect(await call('fdict')).toEqual({ a: 1 }); // the function inside has no plain form
  });

  it('resolves undefined, and reports once, when the global fails or does not exist', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.boom = () => { throw new Error("js boom") };\nexports.rej = async () => { throw new Error("js rejected") };');
    const r = wired(conn);

    expect(await invokeGlobalById(conn, 'global.javascript.boom', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'global.javascript.rej', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'global.javascript.nope', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'global.lua.nope', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'global.python.nope', r.api)).toBeUndefined();
    expect(await invokeGlobalById(conn, 'not a global id', r.api)).toBeUndefined();

    expect(r.errors).toHaveLength(6);
  });

  it('reports at once for what finished at once, and as a promise for what did not', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.now = () => 1;\nexports.later = () => new Promise((res) => setTimeout(() => res(2), 10));');
    setGlobalScriptSource(conn, 'lua', 'function core_now() return 3 end');
    setGlobalScriptSource(conn, 'python', 'import time\ndef core_now(a):\n    return 4\ndef core_later(a):\n    time.sleep(0.01)\n    return 5\n');
    const r = wired(conn);
    const call = (id: string) => invokeGlobalSync(conn, id, r.api);

    expect(call('global.javascript.now')).toEqual({ settled: true, value: 1 });
    expect(call('global.lua.core.now')).toEqual({ settled: true, value: 3 });
    expect(call('global.python.core.now')).toEqual({ settled: true, value: 4 });

    for (const [id, value] of [['global.javascript.later', 2], ['global.python.core.later', 5]] as const) {
      const pending = call(id);
      expect(pending.settled).toBe(false);
      if (!pending.settled) expect(await pending.promise).toEqual({ value });
    }
  });

  it('waits for a Globals Python file that is still loading before it calls into it', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'import time\ntime.sleep(0.02)\ndef core_ready(a):\n    return "loaded"\n');
    const r = wired(conn);

    const first = invokeGlobalSync(conn, 'global.python.core.ready', r.api);
    expect(first.settled).toBe(false);
    if (!first.settled) expect(await first.promise).toEqual({ value: 'loaded' });

    expect(invokeGlobalSync(conn, 'global.python.core.ready', r.api)).toEqual({ settled: true, value: 'loaded' });
  });
});

describe('Lua calls any global like a function', () => {
  async function lua_(conn: string, source: string, extra: Partial<ScriptSandboxApi> = {}) {
    const r = wired(conn, extra);
    await runUserScript(script('lua', source), r.api, conn);
    await flush();
    return r;
  }

  it('gets the value back at once from a JS, Lua or Python global, passing a table', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.core = { double: (args) => args.n * 2, list: () => [1, 2, 3], obj: () => ({ a: { b: "deep" } }) };');
    setGlobalScriptSource(conn, 'lua', 'function core_triple(json) return 3 * 7 end');
    setGlobalScriptSource(conn, 'python', 'def core_name(a):\n    return a["who"].upper()\n');

    const r = await lua_(
      conn,
      [
        'sendCommand("js " .. runGlobal("global.javascript.core.double", {n = 21}))',
        'local l = runGlobal("global.javascript.core.list")',
        'sendCommand("list " .. #l .. " " .. l[3])',
        'sendCommand("deep " .. runGlobal("global.javascript.core.obj").a.b)',
        'sendCommand("lua " .. runGlobal("global.lua.core.triple"))',
        'sendCommand("py " .. runGlobal("global.python.core.name", {who = "orc"}))',
      ].join('\n'),
    );

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['js 42', 'list 3 3', 'deep deep', 'lua 21', 'py ORC']);
  });

  it('still accepts the arguments as a JSON string, and passes other strings as they are', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.kind = (args) => typeof args + ":" + JSON.stringify(args);');

    const r = await lua_(
      conn,
      'sendCommand(runGlobal("global.javascript.kind", "{\\"n\\":1}"))\nsendCommand(runGlobal("global.javascript.kind", "plain words"))\nsendCommand(runGlobal("global.javascript.kind"))\nsendCommand(runGlobal("global.javascript.kind", ""))\nsendCommand(runGlobal("global.javascript.kind", 5))\nsendCommand(runGlobal("global.javascript.kind", true))',
    );

    expect(r.sent).toEqual(['object:{"n":1}', 'string:"plain words"', 'undefined:undefined', 'undefined:undefined', 'number:5', 'boolean:true']);
  });

  it('returns nothing for a failed global, and for one still running', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = () => new Promise((res) => setTimeout(() => res(1), 20));');

    const r = await lua_(
      conn,
      'sendCommand("failed " .. tostring(runGlobal("global.lua.missing")))\nsendCommand("running " .. tostring(runGlobal("global.javascript.later")))',
    );

    expect(r.sent).toEqual(['failed nil', 'running nil']);
  });

  it('calls the callback with the result of a global that was still running', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = (args) => new Promise((res) => setTimeout(() => res(args.n + 1), 20));');

    const r = await lua_(
      conn,
      'runGlobal("global.javascript.later", {n = 41}, function(result, err) sendCommand("cb " .. tostring(result) .. " " .. tostring(err)) end)\nsendCommand("after")',
    );

    // the callback runs once the global is done, never inside the calling script
    expect(r.sent).toEqual(['after', 'cb 42 nil']);
  });

  it('calls the callback even when the result was already returned, after the script has finished', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_now() return 7 end');

    const r = await lua_(
      conn,
      'sendCommand("before")\nlocal now = runGlobal("global.lua.core.now", nil, function(result) sendCommand("cb " .. result) end)\nsendCommand("now " .. now)',
    );

    expect(r.sent).toEqual(['before', 'now 7', 'cb 7']);
  });

  it('calls the callback with an error message when the global fails', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.boom = () => { throw new Error("it broke") };');

    const r = await lua_(
      conn,
      'runGlobal("global.javascript.boom", nil, function(result, err) sendCommand(tostring(result) .. " | " .. err) end)\nrunGlobal("global.lua.absent", nil, function(result, err) sendCommand("absent | " .. err) end)',
    );

    expect(r.sent).toEqual(['nil | it broke', 'absent | function not found: absent']);
  });

  it('runs a callback with the api of the script that registered it', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = () => new Promise((res) => setTimeout(() => res("x"), 10));');
    const a = wired(conn);
    const b = wired(conn);

    await runUserScript(script('lua', 'runGlobal("global.javascript.later", nil, function() sendCommand("from a") end)'), a.api, conn);
    await runUserScript(script('lua', 'runGlobal("global.javascript.later", nil, function() sendCommand("from b") end)'), b.api, conn);
    await flush();

    expect(a.sent).toEqual(['from a']);
    expect(b.sent).toEqual(['from b']);
  });

  it('reports a callback that raises, and does not run one whose engine has been restarted', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = () => new Promise((res) => setTimeout(() => res("x"), 30));');
    const r = wired(conn);

    await runUserScript(script('lua', 'runGlobal("global.lua.absent", nil, function() local x = nil + 1 end)'), r.api, conn);
    await flush();
    // the missing global is reported, and so is the callback that then raised
    expect(r.errors.map((e) => String(e[0]))).toEqual([
      expect.stringContaining('function not found: absent'),
      expect.stringContaining('runGlobal callback error'),
    ]);

    r.errors.length = 0;
    await runUserScript(script('lua', 'runGlobal("global.javascript.later", nil, function() sendCommand("too late") end)'), r.api, conn);
    setGlobalScriptSource(conn, 'lua', 'function core_restart() end'); // Globals edited: the Lua engine restarts
    await runUserScript(script('lua', 'sendCommand("engine restarted")'), r.api, conn);
    await flush(120);

    expect(r.sent).toEqual(['engine restarted']);
    expect(r.errors).toEqual([]);
  });

  it('works with an api that only has the promise form of runGlobal', async () => {
    const conn = freshConnection();
    const sent: string[] = [];
    const api: ScriptSandboxApi = {
      sendCommand: (c) => void sent.push(c),
      error: () => {},
      log: () => {},
      runGlobal: async (id) => (id === 'global.fail' ? Promise.reject(new Error('nope')) : 'promised'),
    };

    await runUserScript(
      script(
        'lua',
        'local now = runGlobal("global.ok", nil, function(r) sendCommand("cb " .. r) end)\nsendCommand("now " .. tostring(now))\nrunGlobal("global.fail", nil, function(r, e) sendCommand("err " .. e) end)',
      ),
      api,
      conn,
    );
    await flush();

    expect(sent).toEqual(['now nil', 'cb promised', 'err nope']);
  });

  it('reads a Lua value the way the bridge does', () => {
    const L = createLuaState();
    const r = wired('x');
    runLuaChunkInState(L, 'v = { 1, 2, { k = "v" } }', r.api);
    lua.lua_getglobal(L, to_luastring('v'));
    expect(luaToJs(L, -1)).toEqual([1, 2, { k: 'v' }]);
    lua.lua_pop(L, 1);
    expect(callLuaGlobalFunctionWithResult(L, 'nope', undefined, r.api)).toEqual({ ok: false, error: 'function not found: nope' });
    expect(lauxlib).toBeDefined();
    closeLuaState(L);
  });
});

describe('Python calls any global like a function', () => {
  async function py(conn: string, source: string) {
    const r = wired(conn);
    await runUserScript(script('python', source), r.api, conn);
    await flush();
    return r;
  }

  it('gets the value back at once from a JS, Lua or Python global', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.core = { double: (args) => args.n * 2, obj: () => ({ list: [1, 2], s: "txt", none: null }) };');
    setGlobalScriptSource(conn, 'lua', 'function core_triple(json) return {answer = 21, words = {"a", "b"}} end');
    setGlobalScriptSource(conn, 'python', 'def core_name(a):\n    return a["who"].upper()\n');

    const r = await py(
      conn,
      [
        'sendCommand("js %d" % runGlobal("global.javascript.core.double", {"n": 21}))',
        'o = runGlobal("global.javascript.core.obj")',
        'sendCommand("obj %s %d %s" % (o["s"].upper(), len(o["list"]), o["none"]))',
        't = runGlobal("global.lua.core.triple")',
        'sendCommand("lua %d %s" % (t["answer"], ",".join(t["words"])))',
        'sendCommand("py " + runGlobal("global.python.core.name", {"who": "orc"}))',
      ].join('\n'),
    );

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['js 42', 'obj TXT 2 None', 'lua 21 a,b', 'py ORC']);
  });

  it('gets None for a failed global', async () => {
    const conn = freshConnection();
    const r = await py(conn, 'sendCommand("failed %s" % runGlobal("global.python.missing"))');
    expect(r.sent).toEqual(['failed None']);
  });

  it('calls the callback with the result of a global that was still running, or with the error', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.later = (args) => new Promise((res) => setTimeout(() => res(args["n"] + 1), 20));\nexports.boom = () => { throw new Error("it broke") };');

    const r = await py(
      conn,
      [
        'def got(result, err):',
        '    sendCommand("cb %s %s" % (result, err))',
        'runGlobal("global.javascript.later", {"n": 41}, got)',
        'runGlobal("global.javascript.boom", None, got)',
        'sendCommand("after")',
      ].join('\n'),
    );

    // the failing global is reported as well as handed to its callback
    expect(r.errors).toEqual([['[Global:javascript] call failed (boom)', 'it broke']]);
    // callbacks run once the global is done, never inside the calling script
    expect(r.sent[0]).toBe('after');
    expect(r.sent.slice(1).sort()).toEqual(['cb 42 None', 'cb None it broke']);
  });

  it('calls a Python target that sleeps through its callback', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'python', 'import time\ndef core_slow(a):\n    time.sleep(0.02)\n    return "slept"\n');

    const r = await py(
      conn,
      'def got(result, err):\n    sendCommand("cb %s" % result)\nnow = runGlobal("global.python.core.slow", None, got)\nsendCommand("now %s" % now)',
    );

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['now None', 'cb slept']);
  });

  it('reports a callback that raises', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_now() return 1 end');

    const r = await py(conn, 'def got(result, err):\n    return 1 / 0\nrunGlobal("global.lua.core.now", None, got)');

    expect(r.errors.map((e) => String(e[0]))).toEqual([expect.stringContaining('[Python runGlobal] callback failed')]);
  });

  it('works with an api that only has the promise form of runGlobal', async () => {
    const conn = freshConnection();
    const sent: string[] = [];
    const api: ScriptSandboxApi = {
      sendCommand: (c) => void sent.push(c),
      error: () => {},
      log: () => {},
      runGlobal: async (id) => (id === 'global.fail' ? Promise.reject(new Error('nope')) : 'promised'),
    };

    await runUserScript(
      script(
        'python',
        'def ok(r, e):\n    sendCommand("cb %s" % r)\ndef bad(r, e):\n    sendCommand("err %s" % e)\nsendCommand("now %s" % runGlobal("global.ok", None, ok))\nrunGlobal("global.fail", None, bad)',
      ),
      api,
      conn,
    );
    await flush();

    expect(sent).toEqual(['now None', 'cb promised', 'err nope']);
  });

  it('treats an explicit None callback as no callback', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_now() return 1 end');

    const r = await py(conn, 'runGlobal("global.lua.core.now", None, None)');

    expect(r.errors).toEqual([]);
    expect(r.logged.map((l) => l[0])).toEqual(['[Python runGlobal] OK']);
  });

  it('logs a statement-form runGlobal as it always did', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'lua', 'function core_now() return 1 end');

    const r = await py(conn, 'runGlobal("global.lua.core.now")');

    expect(r.logged.map((l) => l[0])).toEqual(['[Python runGlobal] OK']);
  });
});

describe('text scripts and the contract', () => {
  it('calls a global of every language from global.<language>.<path> lines', async () => {
    const conn = freshConnection();
    setGlobalScriptSource(conn, 'javascript', 'exports.core = { hi(api, args) { api.sendCommand("js hi"); } };');
    setGlobalScriptSource(conn, 'typescript', 'exports.core = { hi: (api: any, args: unknown) => api.sendCommand("ts hi") };');
    setGlobalScriptSource(conn, 'lua', 'function core_hi() sendCommand("lua hi") end');
    setGlobalScriptSource(conn, 'python', 'def core_hi(a):\n    sendCommand("py hi")\n');
    const r = wired(conn);

    await runUserScript(
      script('text', 'look\nglobal.javascript.core.hi\nglobal.typescript.core.hi\nglobal.lua.core.hi\nglobal.python.core.hi'),
      r.api,
      conn,
    );
    await flush();

    expect(r.errors).toEqual([]);
    expect(r.sent).toEqual(['look', 'js hi', 'ts hi', 'lua hi', 'py hi']);
  });
});

describe('helpers', () => {
  it('plain data drops what has no plain form', () => {
    expect(toPlainData(undefined)).toBeUndefined();
    expect(toPlainData(() => 1)).toBeUndefined();
    expect(toPlainData({ a: [1, { b: 2 }] })).toEqual({ a: [1, { b: 2 }] });
    expect(toPlainData(BigInt(1))).toBeUndefined();
  });

  it('a Python module that fails to load rejects loadPythonModuleBody and reports it', async () => {
    const r = wired('x');
    await expect(loadPythonModuleBody('sa_contract_bad', 'def (:', r.api)).rejects.toThrow();
    expect(String(r.errors[0][0])).toContain('load module error');
  });
});
