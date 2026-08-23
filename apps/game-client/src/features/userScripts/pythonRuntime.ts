// apps/game-client/src/features/userScripts/pythonRuntime.ts
import type { ScriptSandboxApi } from './types';
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
    func: new (fn: (...args: unknown[]) => unknown) => unknown;
    none: { none$: unknown };
  };

  misceval: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncToPromise: (thunk: () => unknown) => Promise<any>;
    callsimOrSuspendArray: (fn: unknown, args: unknown[]) => unknown;
  };

  importMainWithBody: (name: string, dump: boolean, body: string, canSuspend: boolean) => unknown;
};

function getSk(): SkulptFacade {
  return Sk as unknown as SkulptFacade;
}

/**
 * Route Python print() → api.log
 */
function makePythonOutput(api: ScriptSandboxApi) {
  return function outf(text: string) {
    api.log?.(text);
  };
}

function pyToJs(value: unknown): unknown {
  // Skulpt's recommended conversion helper
  return getSk().ffi.remapToJs(value);
}

function pyNone(): unknown {
  return getSk().builtin.none.none$;
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

  // runGlobal(id, args?) – only if provided
  if (api.runGlobal) {
    b.runGlobal = new sk.builtin.func((pyId: unknown, pyArgs?: unknown) => {
      const id = String(pyToJs(pyId));
      const args = pyArgs !== undefined ? pyToJs(pyArgs) : undefined;

      api
        .runGlobal?.(id, args)
        .then((res) => api.log?.('[Python runGlobal] OK', res))
        .catch((err) => api.error?.('[Python runGlobal] failed', err instanceof Error ? err.message : String(err)));

      return pyNone();
    });
  }

  // getGlobalVar(key)
  if (api.getGlobalVar) {
    b.getGlobalVar = new sk.builtin.func((pyKey: unknown) => {
      const key = String(pyToJs(pyKey));
      const v = api.getGlobalVar?.(key);
      // Return as JSON string if not simple string
      const out = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return out as unknown;
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
      return v as unknown;
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

export function configurePythonForApi(api: ScriptSandboxApi) {
  const sk = getSk();

  sk.configure({
    output: makePythonOutput(api),
    read: builtinRead,
  });

  registerBuiltins(api);
}

/**
 * Execute Python source with ScriptSandboxApi bridge.
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
export async function runPythonSourceInBrowser(source: string, api: ScriptSandboxApi): Promise<void> {
  const sk = getSk();

  try {
    configurePythonForApi(api);

    await sk.misceval.asyncToPromise(() => {
      return sk.importMainWithBody('<user_script>', false, source, true);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] Python runtime error: ${msg}`);
  }
}

// Loaded global modules, held as Skulpt module OBJECTS keyed by the name the
// caller used.
//
// Holding the object is what makes global Python work at all. importMainWithBody
// registers the module as `__main__` regardless of the name passed — the name is
// only the filename — so the previous approach of loading under `moduleName` and
// then calling in from a throwaway module that did `import <moduleName> as g`
// always failed with "No module named <moduleName>", and no global Python
// function could be invoked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadedModules = new Map<string, any>();

/**
 * Load a module body into a stable module name (for persistent globals).
 */
export async function loadPythonModuleBody(moduleName: string, source: string, api: ScriptSandboxApi): Promise<void> {
  const sk = getSk();

  try {
    configurePythonForApi(api);

    const mod = await sk.misceval.asyncToPromise(() => {
      return sk.importMainWithBody(moduleName, false, source, true);
    });
    loadedModules.set(moduleName, mod);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] load module error (${moduleName}): ${msg}`);
    throw err;
  }
}

/**
 * Call a function inside a loaded module by importing it and invoking.
 *
 * Convention:
 *   def foo(args): ...
 */
export async function callPythonModuleFunction(
  moduleName: string,
  funcName: string,
  args: unknown,
  api: ScriptSandboxApi,
): Promise<void> {
  const sk = getSk();

  const mod = loadedModules.get(moduleName);
  if (!mod) {
    // No global python source was loaded for this connection.
    api.error?.(`[UserScript:Python] global module not loaded: ${moduleName}`);
    return;
  }

  try {
    configurePythonForApi(api);

    // Read the attribute straight off the module object. Besides being the only
    // thing that actually works, this stops interpolating a caller-supplied
    // function name into generated Python source.
    const fn = mod.tp$getattr(sk.ffi.remapToPy(funcName));
    if (!fn) {
      api.error?.(`[UserScript:Python] global python function not found: ${funcName}`);
      return;
    }

    const pyArgs = args === undefined ? pyNone() : sk.ffi.remapToPy(args);
    await sk.misceval.asyncToPromise(() => sk.misceval.callsimOrSuspendArray(fn, [pyArgs]));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] call module function error (${moduleName}.${funcName}): ${msg}`);
    throw err;
  }
}
