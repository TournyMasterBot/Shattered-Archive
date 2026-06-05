// apps/game-client/src/features/userScripts/pythonRuntime.ts
import type { ScriptSandboxApi } from './types';
import Sk from 'skulpt';

/**
 * Minimal “facade” typing for the parts of Skulpt we use.
 * This avoids `any` while not pretending we have full Skulpt typings.
 */
type SkulptFacade = {
  configure: (opts: { output: (text: string) => void; read: (filename: string) => string }) => void;

  ffi: {
    remapToJs: (value: unknown) => unknown;
  };

  builtins: Record<string, unknown>;

  builtin: {
    func: new (fn: (...args: unknown[]) => unknown) => unknown;
    none: { none$: unknown };
  };

  misceval: {
    asyncToPromise: (thunk: () => unknown) => Promise<unknown>;
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

export function configurePythonForApi(api: ScriptSandboxApi) {
  const sk = getSk();

  sk.configure({
    output: makePythonOutput(api),
    read: function (_filename: string) {
      throw new Error('Skulpt read() not implemented');
    },
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

/**
 * Load a module body into a stable module name (for persistent globals).
 */
export async function loadPythonModuleBody(moduleName: string, source: string, api: ScriptSandboxApi): Promise<void> {
  const sk = getSk();

  try {
    configurePythonForApi(api);

    await sk.misceval.asyncToPromise(() => {
      return sk.importMainWithBody(moduleName, false, source, true);
    });
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

  // Make args available as JSON text to avoid tricky quoting
  const argsJson = args === undefined ? '' : JSON.stringify(args);

  // NOTE: Use a throwaway "caller" module so we don't overwrite the global module.
  const callerName = `${moduleName}__call__`;

  const body = `
import ${moduleName} as g
fn = getattr(g, "${funcName}", None)
if fn is None:
  raise Exception("global python function not found: ${funcName}")
args_json = r'''${argsJson}'''
try:
  import json
  parsed = json.loads(args_json) if args_json else None
except Exception:
  parsed = args_json
fn(parsed)
`;

  try {
    configurePythonForApi(api);

    await sk.misceval.asyncToPromise(() => {
      return sk.importMainWithBody(callerName, false, body, true);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] call module function error (${moduleName}.${funcName}): ${msg}`);
    throw err;
  }
}
