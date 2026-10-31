// apps/game-client/src/features/userScripts/pythonRuntime.ts
import type { GlobalCall, ScriptSandboxApi } from './types';
import { toPlainData } from './plainData';
import Sk from 'skulpt';

/**
 * Minimal “facade” typing for the parts of Skulpt we use.
 * This avoids `any` while not pretending we have full Skulpt typings.
 */
type SkulptFacade = {
  configure: (opts: { output: (text: string) => void; read: (filename: string) => string }) => void;

  /** Skulpt's bundled standard library, loaded by the package's dist/skulpt-stdlib.js. */
  builtinFiles?: { files: Record<string, string> };

  ffi: {
    remapToJs: (value: unknown) => unknown;
    remapToPy: (value: unknown) => unknown;
  };

  builtins: Record<string, unknown>;

  builtin: {
    module: new () => PyModule;
    func: new (fn: (...args: unknown[]) => unknown) => unknown;
    str: new (value: string) => unknown;
    none: { none$: unknown };
  };

  misceval: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncToPromise: (thunk: () => unknown) => Promise<any>;
    callsimOrSuspendArray: (fn: unknown, args: unknown[]) => unknown;
  };

  /** Compiles module source to JS; the module function takes the globals dict to run in (Skulpt's own exec/eval do this). */
  compile: (source: string, filename: string, mode: string, canSuspend: boolean) => { code: string; funcname: string };

  /** The host global object; compiled module code must be evaluated in ITS scope, not ours. */
  global: { eval: (code: string) => unknown };
};

type PyNamespace = Record<string, unknown>;

/** A Skulpt module whose `$d` is its globals dict; tp$getattr reads a name out of it. */
type PyModule = { $d: PyNamespace; tp$getattr: (name: unknown) => unknown };

type ModuleScope = (globals: PyNamespace) => unknown;

function getSk(): SkulptFacade {
  return Sk as unknown as SkulptFacade;
}

/**
 * Apis in effect, innermost last. print() and the bridge builtins are shared by every script (Skulpt has one
 * global builtins table), so they follow the top entry. Entries leave by identity, not by popping, because
 * runs that suspend (time.sleep) can finish out of order.
 */
const activeApis: ScriptSandboxApi[] = [];

/**
 * Route Python print() → the api of the run in progress
 */
function outputToActiveApi(text: string) {
  activeApis[activeApis.length - 1]?.log?.(text);
}

/** Bridge builtins that exist only when the api offers them; a run without one must not see the last run's. */
const OPTIONAL_BUILTINS = [
  'httpGetJson',
  'writeTerminal',
  'runGlobal',
  'getGlobalVar',
  'setGlobalVar',
  'deleteGlobalVar',
  'getNamedVar',
  'doAfter',
] as const;

function pyToJs(value: unknown): unknown {
  // Skulpt's recommended conversion helper
  return getSk().ffi.remapToJs(value);
}

function pyNone(): unknown {
  return getSk().builtin.none.none$;
}

/**
 * A JS string as a real Python `str`. A Skulpt builtin must return Python objects: a raw JS string only survives
 * %-formatting and str(...), while .upper()/.split(), `+`, `==`, len() and int() on it throw.
 */
function pyStr(value: string): unknown {
  return new (getSk().builtin.str)(value);
}

/** A JS value as a Python one; nothing (undefined / null) is None. */
function toPy(value: unknown): unknown {
  return value === undefined || value === null ? pyNone() : getSk().ffi.remapToPy(value);
}

/** An api without runGlobalNow only has the promise form; fold its result/rejection into the outcome shape. */
function asOutcome(result: Promise<unknown> | undefined): Promise<{ value?: unknown; error?: string }> {
  return Promise.resolve(result).then(
    (value) => ({ value }),
    (err) => ({ error: err instanceof Error ? err.message : String(err) }),
  );
}

/** Call a runGlobal callback with (result, error) under the api that asked for it. */
function fireCallback(api: ScriptSandboxApi, callback: unknown, value: unknown, error: string | undefined): void {
  const sk = getSk();
  const call = startBound(api, () => sk.misceval.callsimOrSuspendArray(callback, [toPy(value), toPy(error)]));
  const done = call.settled ? Promise.resolve(call) : call.promise;
  void done.then((outcome) => {
    if (outcome.error !== undefined) api.error?.(`[Python runGlobal] callback failed: ${outcome.error}`);
  });
}

/**
 * Register bridge functions as Python builtins:
 *
 *  - log(*args)            → api.log(...)
 *  - error(*args)          → api.error(...)
 *  - sendCommand(cmd)      → api.sendCommand(cmd)
 *  - httpGetJson(url)      → api.httpGetJson(url) (fire-and-forget)
 *  - writeTerminal(dsl)    → api.writeTerminal(dsl)  (DSL-colored output → terminal)
 *
 * EXTENDED:
 *  - runGlobal(id, args?)  → api.runGlobal(...)
 *  - getGlobalVar(key)
 *  - setGlobalVar(key, value)
 *  - deleteGlobalVar(key)
 *  - getNamedVar(name)
 *  - event (dict: event["name"], event["payload"], ...; None if not applicable)
 */
function registerBuiltins(api: ScriptSandboxApi) {
  const sk = getSk();
  const b = sk.builtins;

  for (const name of OPTIONAL_BUILTINS) {
    if (!api[name]) delete b[name];
  }

  // log(*args)
  b.log = new sk.builtin.func((...pyArgs: unknown[]) => {
    const jsArgs = pyArgs.map(pyToJs);
    api.log?.(...jsArgs);
    return pyNone();
  });

  // error(*args)
  b.error = new sk.builtin.func((...pyArgs: unknown[]) => {
    const jsArgs = pyArgs.map(pyToJs);
    api.error?.(...jsArgs);
    return pyNone();
  });

  // sendCommand(cmd)
  b.sendCommand = new sk.builtin.func((pyCmd: unknown) => {
    const cmd = pyToJs(pyCmd);
    api.sendCommand?.(String(cmd));
    return pyNone();
  });

  // event (trigger/alias/timer context), exposed as a Python dict:
  //   event["name"], event["payload"], event["payload"]["text"], etc.
  // None when no event context is active (e.g. most Timer scripts).
  b.event = api.event !== undefined ? sk.ffi.remapToPy(api.event) : pyNone();

  // httpGetJson(url) – only if provided
  if (api.httpGetJson) {
    b.httpGetJson = new sk.builtin.func((pyUrl: unknown) => {
      const url = String(pyToJs(pyUrl));

      api
        .httpGetJson?.(url)
        .then((result: unknown) => {
          api.log?.('[Python httpGetJson] OK', result);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err ?? 'unknown error');
          api.error?.('[Python httpGetJson] failed', msg);
        });

      return pyNone();
    });
  }

  // writeTerminal(dsl) – only if provided
  if (api.writeTerminal) {
    b.writeTerminal = new sk.builtin.func((pyDsl: unknown) => {
      const dsl = String(pyToJs(pyDsl));
      api.writeTerminal?.(dsl);
      return pyNone();
    });
  }

  // runGlobal(id, args=None, callback=None) – only if provided. Also an ordinary call: when the global finished
  // before it returned (Lua, JS, and most Python) the result is the return value; one that is still running
  // returns None and delivers through the callback, which is ALWAYS called later as callback(result, error).
  if (api.runGlobal) {
    b.runGlobal = new sk.builtin.func((pyId: unknown, pyArgs?: unknown, pyCallback?: unknown) => {
      const id = String(pyToJs(pyId));
      const args = pyArgs !== undefined ? (pyToJs(pyArgs) ?? undefined) : undefined;
      const callback = pyCallback === undefined || pyCallback === pyNone() ? undefined : pyCallback;

      const call: GlobalCall = api.runGlobalNow
        ? api.runGlobalNow(id, args)
        : { settled: false, promise: asOutcome(api.runGlobal?.(id, args)) };

      const outcome = call.settled ? Promise.resolve(call) : call.promise;
      void outcome.then(({ value, error }) => {
        if (callback !== undefined) fireCallback(api, callback, value, error);
        else if (error !== undefined) api.error?.('[Python runGlobal] failed', error);
        else api.log?.('[Python runGlobal] OK', value);
      });

      return call.settled && call.error === undefined ? toPy(call.value) : pyNone();
    });
  }

  // getGlobalVar(key)
  if (api.getGlobalVar) {
    b.getGlobalVar = new sk.builtin.func((pyKey: unknown) => {
      const key = String(pyToJs(pyKey));
      const v = api.getGlobalVar?.(key);
      // Return as JSON string if not simple string
      const out = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return pyStr(out);
    });
  }

  // setGlobalVar(key, value)
  if (api.setGlobalVar) {
    b.setGlobalVar = new sk.builtin.func((pyKey: unknown, pyVal: unknown) => {
      const key = String(pyToJs(pyKey));
      const v = pyToJs(pyVal);
      api.setGlobalVar?.(key, v);
      return pyNone();
    });
  }

  // deleteGlobalVar(key)
  if (api.deleteGlobalVar) {
    b.deleteGlobalVar = new sk.builtin.func((pyKey: unknown) => {
      const key = String(pyToJs(pyKey));
      api.deleteGlobalVar?.(key);
      return pyNone();
    });
  }

  // getNamedVar(name)
  if (api.getNamedVar) {
    b.getNamedVar = new sk.builtin.func((pyName: unknown) => {
      const name = String(pyToJs(pyName));
      const v = api.getNamedVar?.(name) ?? '';
      return pyStr(v);
    });
  }

  // doAfter(delay_ms, type, command)
  if (api.doAfter) {
    b.doAfter = new sk.builtin.func((pyDelay: unknown, pyType: unknown, pyCmd: unknown) => {
      const delayMs = Number(pyToJs(pyDelay));
      const type = String(pyToJs(pyType)) as 'world' | 'alias';
      const command = String(pyToJs(pyCmd));
      api.doAfter?.(delayMs, type, command);
      return pyNone();
    });
  }
}

/**
 * Serves Skulpt's bundled standard library.
 *
 * This used to throw unconditionally, which made `import <anything>` fail — and
 * `print()` too, since Skulpt reaches for `sys` to reach stdout. Bridge calls
 * (sendCommand/log/…) were unaffected, which is why Python scripts otherwise
 * worked. Nothing here can reach the network or a real filesystem: the only
 * readable names are the ones baked into the Skulpt package's stdlib bundle.
 */
function builtinRead(filename: string): string {
  const files = getSk().builtinFiles?.files;
  // hasOwnProperty, not a bare lookup: `files` is a plain object, so a module
  // name like 'constructor' or '__proto__' would otherwise resolve up the
  // prototype chain and hand Skulpt a native function where source is expected.
  if (!files || !Object.prototype.hasOwnProperty.call(files, filename)) {
    throw new Error(`File not found: '${filename}'`);
  }
  const file = files[filename];
  if (typeof file !== 'string') throw new Error(`File not found: '${filename}'`);
  return file;
}

let configured = false;

/**
 * Skulpt is configured once. configure() also re-derives the language tables (operators, dunder methods,
 * tokens), which is wasted work on every trigger fire; only the output router and the bridge builtins vary
 * per run, and both follow `activeApis`.
 */
function ensureConfigured() {
  if (configured) return;
  getSk().configure({ output: outputToActiveApi, read: builtinRead });
  configured = true;
}

/** Bind the bridge for `api`: configure Skulpt (once) and point print() and the builtins at it. */
export function configurePythonForApi(api: ScriptSandboxApi) {
  ensureConfigured();
  registerBuiltins(api);
}

/** Stop treating `api` as the run in progress, and rebind whichever run still is. */
function release(api: ScriptSandboxApi): void {
  const at = activeApis.lastIndexOf(api);
  if (at >= 0) activeApis.splice(at, 1);
  const outer = activeApis[activeApis.length - 1];
  if (outer) registerBuiltins(outer);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
}

function isSuspension(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as { $isSuspension?: boolean }).$isSuspension === true;
}

/**
 * Start Python work under `api` and report it as a GlobalCall. Skulpt runs the work synchronously until it
 * suspends (time.sleep and the like), so anything that never suspends is `settled` before this returns: the caller
 * does not have to wait a tick, and a script keeps running in the same turn it was triggered in, as it always has.
 * Work that does suspend is driven to the end in the background and `promise` resolves when it is done. The api
 * stays bound for exactly as long as the work runs.
 */
function startBound(api: ScriptSandboxApi, start: () => unknown, convert: (raw: unknown) => unknown = () => undefined): GlobalCall {
  configurePythonForApi(api);
  activeApis.push(api);

  let raw: unknown;
  try {
    raw = start();
  } catch (err) {
    release(api);
    return { settled: true, error: errorText(err) };
  }

  const finish = (done: unknown): { value?: unknown; error?: string } => {
    try {
      return { value: convert(done) };
    } catch (err) {
      return { error: errorText(err) };
    }
  };

  if (!isSuspension(raw)) {
    release(api);
    return { settled: true, ...finish(raw) };
  }

  const promise = getSk()
    .misceval.asyncToPromise(() => raw)
    .then(finish, (err: unknown) => ({ error: errorText(err) }))
    .finally(() => release(api));
  return { settled: false, promise };
}

/** Report a failure (once) through `report`, whether the work settled at once or later. */
function reporting(call: GlobalCall, report: (message: string) => void): GlobalCall {
  if (call.settled) {
    if (call.error !== undefined) report(call.error);
    return call;
  }
  return {
    settled: false,
    promise: call.promise.then((outcome) => {
      if (outcome.error !== undefined) report(outcome.error);
      return outcome;
    }),
  };
}

function newNamespace(): PyNamespace {
  const sk = getSk();
  return {
    __name__: new sk.builtin.str('__main__'),
    __doc__: pyNone(),
    __package__: pyNone(),
  };
}

// Compiled module functions by source. A trigger fires on every matching line with the same text, and parse +
// compile + eval dominates a small script's cost. Re-running a module function is exactly what Skulpt's own
// exec() does (each call builds fresh locals in the globals dict it is given), and the one piece of state on
// the function, $wakingSuspension, is set and consumed in the same synchronous step on resume.
const compiled = new Map<string, ModuleScope>();
const COMPILED_MAX = 100;

function compileModule(source: string, filename: string): ModuleScope {
  const key = `${filename}\u0000${source}`;
  const hit = compiled.get(key);
  if (hit) return hit;

  const sk = getSk();
  const co = sk.compile(source, filename, 'exec', true);
  const scope = sk.global.eval(`${co.code}\n${co.funcname};`) as ModuleScope;

  if (compiled.size >= COMPILED_MAX) compiled.clear();
  compiled.set(key, scope);
  return scope;
}

/** Run source with `globals` as its module namespace, so what it defines stays there for whoever shares it. */
function startModule(api: ScriptSandboxApi, globals: PyNamespace, source: string, filename: string): GlobalCall {
  return startBound(api, () => {
    const sk = getSk();
    const scope = compileModule(source, filename);
    // importMainWithBody used to stamp these on every run; the loop guards in compiled code read them.
    const clock = sk as unknown as { execStart?: Date; lastYield?: Date };
    clock.execStart = clock.lastYield = new Date();
    return scope(globals);
  });
}

// One engine per name, normally one per connection (globalRuntime derives the name). An engine is a single
// module namespace: the Globals -> Python source is run in it first, and every trigger / alias / timer script
// of the connection runs in it afterwards, so functions and variables defined by any of them are visible to
// all of them — one program, not many. Held as the module OBJECT (see callPythonModuleFunction).
const engines = new Map<string, PyModule>();

function engineFor(name: string): PyModule {
  let mod = engines.get(name);
  if (!mod) {
    mod = new (getSk().builtin.module)();
    mod.$d = newNamespace();
    engines.set(name, mod);
  }
  return mod;
}

/** Drop an engine's namespace (Globals edited, or emptied); the next use starts it fresh. */
export function resetPythonEngine(name: string): void {
  engines.delete(name);
}

/**
 * Execute Python source with ScriptSandboxApi bridge.
 *
 * With an `engineName` the script runs in that engine's shared namespace (see above); without one it gets a
 * namespace of its own (plugin-bundled scripts, which must not touch the user's engine). The script starts
 * running before this returns, in the caller's turn; the promise settles when it has finished.
 *
 * Python can directly call:
 *
 *   log("Hello from Python")
 *   sendCommand("look")
 *   httpGetJson("https://api.github.com/...")
 *   writeTerminal("{rHello{G world{x\\n")
 *   runGlobal("global.lua.foo", {"x": 1})
 *   setGlobalVar("k", "v")
 *   getNamedVar("TARGET")
 *   event["payload"]["text"]  (trigger/alias context; None if not applicable)
 */
export async function runPythonSourceInBrowser(
  source: string,
  api: ScriptSandboxApi,
  engineName?: string,
): Promise<void> {
  const call = startModule(api, engineName ? engineFor(engineName).$d : newNamespace(), source, '<user_script>.py');
  const outcome = call.settled ? call : await call.promise;
  if (outcome.error !== undefined) api.error?.(`[UserScript:Python] Python runtime error: ${outcome.error}`);
}

/**
 * (Re)start the engine `moduleName` and run the Globals -> Python source in it, reporting through api.error. The
 * result is settled at once unless the source suspends. Anything a previous load or script left in the namespace
 * is gone, and the engine stays up with whatever the source defined before a failure.
 */
export function loadPythonModuleBodyNow(moduleName: string, source: string, api: ScriptSandboxApi): GlobalCall {
  resetPythonEngine(moduleName);
  const mod = engineFor(moduleName);
  return reporting(startModule(api, mod.$d, source, `${moduleName}.py`), (message) =>
    api.error?.(`[UserScript:Python] load module error (${moduleName}): ${message}`),
  );
}

/** loadPythonModuleBodyNow for callers that can wait; rejects if the source failed. */
export async function loadPythonModuleBody(moduleName: string, source: string, api: ScriptSandboxApi): Promise<void> {
  const call = loadPythonModuleBodyNow(moduleName, source, api);
  const outcome = call.settled ? call : await call.promise;
  if (outcome.error !== undefined) throw new Error(outcome.error);
}

/**
 * Call a function in a loaded module and report what it returned as plain data. The call is settled at once
 * unless the function suspends. Failures are reported through api.error.
 *
 * Convention:
 *   def foo(args): ...
 */
export function callPythonModuleFunctionNow(
  moduleName: string,
  funcName: string,
  args: unknown,
  api: ScriptSandboxApi,
): GlobalCall {
  const sk = getSk();

  const mod = engines.get(moduleName);
  if (!mod) {
    // No global python source was loaded for this connection.
    const error = `global module not loaded: ${moduleName}`;
    api.error?.(`[UserScript:Python] ${error}`);
    return { settled: true, error };
  }

  // Read the attribute straight off the module object. Besides being the only thing that actually works, this
  // stops interpolating a caller-supplied function name into generated Python source.
  ensureConfigured();
  const fn = mod.tp$getattr(sk.ffi.remapToPy(funcName));
  if (!fn) {
    const error = `global python function not found: ${funcName}`;
    api.error?.(`[UserScript:Python] ${error}`);
    return { settled: true, error };
  }

  const pyArgs = args === undefined ? pyNone() : sk.ffi.remapToPy(args);
  const call = startBound(
    api,
    () => sk.misceval.callsimOrSuspendArray(fn, [pyArgs]),
    (raw) => {
      try {
        return toPlainData(pyToJs(raw));
      } catch {
        return undefined; // a Python object with no plain-data form (a function, a class)
      }
    },
  );
  return reporting(call, (message) =>
    api.error?.(`[UserScript:Python] call module function error (${moduleName}.${funcName}): ${message}`),
  );
}

/** callPythonModuleFunctionNow for callers that can wait: resolves with the result, or undefined if it failed (already reported). */
export async function callPythonModuleFunction(
  moduleName: string,
  funcName: string,
  args: unknown,
  api: ScriptSandboxApi,
): Promise<unknown> {
  const call = callPythonModuleFunctionNow(moduleName, funcName, args, api);
  const outcome = call.settled ? call : await call.promise;
  return outcome.error === undefined ? outcome.value : undefined;
}
