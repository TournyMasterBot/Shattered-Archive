// apps/game-client/src/features/userScripts/pythonRuntime.ts
import type { ScriptSandboxApi } from './types';
import Sk from 'skulpt';

/**
 * Route Python print() → api.log
 */
function makePythonOutput(api: ScriptSandboxApi) {
  return function outf(text: string) {
    api.log?.(text);
  };
}

function pyToJs(value: any): any {
  // Skulpt's recommended conversion helper
  return (Sk as any).ffi.remapToJs(value);
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
  const b: any = (Sk as any).builtins;

  // log(*args)
  b.log = new (Sk as any).builtin.func((...pyArgs: any[]) => {
    const jsArgs = pyArgs.map(pyToJs);
    api.log?.(...jsArgs);
    return (Sk as any).builtin.none.none$;
  });

  // error(*args)
  b.error = new (Sk as any).builtin.func((...pyArgs: any[]) => {
    const jsArgs = pyArgs.map(pyToJs);
    api.error?.(...jsArgs);
    return (Sk as any).builtin.none.none$;
  });

  // sendCommand(cmd)
  b.sendCommand = new (Sk as any).builtin.func((pyCmd: any) => {
    const cmd = pyToJs(pyCmd);
    api.sendCommand?.(String(cmd));
    return (Sk as any).builtin.none.none$;
  });

  // httpGetJson(url) – only if provided
  if (api.httpGetJson) {
    b.httpGetJson = new (Sk as any).builtin.func((pyUrl: any) => {
      const url = String(pyToJs(pyUrl));

      api
        .httpGetJson?.(url)
        .then((result) => {
          api.log?.('[Python httpGetJson] OK', result);
        })
        .catch((err) => {
          api.error?.('[Python httpGetJson] failed', err instanceof Error ? err.message : String(err));
        });

      return (Sk as any).builtin.none.none$;
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
  // Configure Skulpt
  Sk.configure({
    output: makePythonOutput(api),
    read: function (_filename: string) {
      throw new Error('Skulpt read() not implemented');
    },
  });

  // Install builtins that forward to JS api
  registerBuiltins(api);

  try {
    await (Sk as any).misceval.asyncToPromise(() => {
      return (Sk as any).importMainWithBody('<user_script>', false, source, true);
    });
  } catch (err: any) {
    const msg = err && err.toString ? err.toString() : String(err ?? 'Unknown error');
    api.error?.(`[UserScript:Python] Python runtime error: ${msg}`);
  }
}
