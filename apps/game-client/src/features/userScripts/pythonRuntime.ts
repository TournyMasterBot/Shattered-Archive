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
 *  - log(*args)         → api.log(...)
 *  - error(*args)       → api.error(...)
 *  - sendCommand(cmd)   → api.sendCommand(cmd)
 *  - httpGetJson(url)   → api.httpGetJson(url) (fire-and-forget)
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
}

/**
 * Execute Python source with ScriptSandboxApi bridge.
 *
 * Python can directly call:
 *
 *   log("Hello from Python")
 *   sendCommand("look")
 *   httpGetJson("https://api.github.com/...")
 */
export async function runPythonSourceInBrowser(source: string, api: ScriptSandboxApi): Promise<void> {
  const sk = getSk();

  try {
    sk.configure({
      output: makePythonOutput(api),
      read: function (_filename: string) {
        throw new Error('Skulpt read() not implemented');
      },
    });

    registerBuiltins(api);

    await sk.misceval.asyncToPromise(() => {
      return sk.importMainWithBody('<user_script>', false, source, true);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] Python runtime error: ${msg}`);
  }
}
