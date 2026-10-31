import ts from 'typescript';
import { AnyUserScript, AliasScript, TimerScript, TriggerScript, ScriptSandboxApi, UserScriptLanguage } from './types';
import { runLuaSourceInBrowser } from './luaRuntime';
import { runPythonSourceInBrowser } from './pythonRuntime';
import { runLuaInEngine, runPythonInEngine, getJsGlobalScope } from './globalRuntime';
import { ScriptErrorInfo } from '../../types/userscript-types/script-error-info';

function isGlobalIdentifierLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed !== line) return false;

  if (!trimmed.startsWith('global.')) return false;

  const parts = trimmed.split('.');
  if (parts.length < 3) return false;

  const lang = parts[1];
  return lang === 'javascript' || lang === 'lua' || lang === 'python' || lang === 'typescript';
}

function isValidJsIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

/**
 * If api.event.payload.vars exists (e.g. { TARGET: "weed" }),
 * inject JS locals so user code can reference TARGET directly.
 */
function buildAliasVarsPrelude(api: ScriptSandboxApi): string {
  const vars = (api as any)?.event?.payload?.vars;
  if (!vars || typeof vars !== 'object') return '';

  const keys = Object.keys(vars);
  if (keys.length === 0) return '';

  const lines: string[] = [];

  // Access vars safely at runtime (values are not string-injected into code)
  lines.push(`const __vars = (event && event.payload && event.payload.vars) ? event.payload.vars : {};`);

  for (const k of keys) {
    const key = String(k ?? '').trim();
    if (!key) continue;
    if (!isValidJsIdentifier(key)) continue;

    // Example: const TARGET = __vars["TARGET"];
    lines.push(`const ${key} = __vars[${JSON.stringify(key)}];`);
  }

  return lines.join('\n') + '\n';
}

// A function that may `await`. A script body used to be a plain function, so the `await runGlobal(...)` /
// `await httpGetJson(...)` the docs show was a syntax error; it runs synchronously up to its first `await`, so a
// script that never awaits behaves exactly as it did.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...callArgs: unknown[]) => Promise<unknown>;

// Names the script wrapper binds from the api itself. A Globals export called one of these is not also bound.
const BRIDGE_NAMES: ReadonlySet<string> = new Set([
  'api',
  '__globals',
  'sendCommand',
  'doAfter',
  'log',
  'error',
  'event',
  'writeTerminal',
  'httpGetJson',
  'runGlobal',
  'getGlobalVar',
  'setGlobalVar',
  'setGlobalVar2',
  'deleteGlobalVar',
  'getNamedVar',
]);

/**
 * Core JS sandbox runner.
 *
 * With a `connectionId` the exports of the connection's Globals JavaScript / TypeScript files are bound as names, so
 * `core.echo({ text })` just works (see getJsGlobalScope). The script body sits in a function of its own inside
 * the wrapper, so it can still declare a `const` with the same name as one of them.
 */
async function runJavascript(
  source: string,
  api: ScriptSandboxApi,
  connectionId?: string | null,
  language: 'javascript' | 'typescript' = 'javascript',
): Promise<void> {
  try {
    const varPrelude = buildAliasVarsPrelude(api);
    const globals = connectionId === undefined ? {} : getJsGlobalScope(connectionId, api, language, BRIDGE_NAMES);
    const globalNames = Object.keys(globals);

    const fn = new AsyncFunction(
      'api',
      '__globals',
      `"use strict";
const {
  sendCommand,
  doAfter,
  log,
  error,
  event,
  writeTerminal,
  httpGetJson,
  runGlobal,
  getGlobalVar,
  setGlobalVar,
  deleteGlobalVar,
  getNamedVar,
  setGlobalVar: setGlobalVar2, // (harmless if duplicated by bundler transforms)
} = api;
${globalNames.length ? `const { ${globalNames.join(', ')} } = __globals;` : ''}
try {
  await (async function () {
${varPrelude}
${source}
  })();
} catch (err) {
  error(
    "[UserScript:JS] Runtime error",
    err && err.message ? err.message : String(err)
  );
}`,
    );

    await fn(api, globals);
  } catch (err: any) {
    api.error?.('[UserScript:JS] Failed to compile or execute script', err?.message ?? String(err));
  }
}

/**
 * TypeScript runner: transpile TS -> JS, then reuse runJavascript.
 */
async function runTypescript(source: string, api: ScriptSandboxApi, connectionId?: string | null): Promise<void> {
  try {
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2018,
        strict: false,
      },
    });

    await runJavascript(outputText, api, connectionId, 'typescript');
  } catch (err: any) {
    api.error?.('[UserScript:TS] Failed to transpile or execute script', err?.message ?? String(err));
  }
}

/**
 * Plain text runner:
 * - one command per line
 * - blank lines preserved (sent as empty string)
 * - NO trimming, NO normalization
 */
async function runPlainText(source: string, api: ScriptSandboxApi): Promise<void> {
  const text = source ?? '';
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    if (api.runGlobal && isGlobalIdentifierLine(line)) {
      try {
        await api.runGlobal(line);
      } catch (err) {
        api.error?.('[UserScript:text] global invocation failed', err instanceof Error ? err.message : String(err));
      }
      continue;
    }

    api.sendCommand(line);
  }
}

/**
 * Dispatch to the correct language runner.
 *
 * Lua and Python are one engine per language per connection: with a `connectionId` the script runs in that
 * engine, sharing every global with the Globals source and with all the user's other scripts. Without one (the
 * plugin-bundled scripts) it runs isolated and leaves nothing behind. JavaScript / TypeScript scripts are
 * always isolated from one another, but with a `connectionId` they can call the exports of the Globals JS / TS
 * files by name.
 */
export async function runUserScript(
  script: AnyUserScript,
  api: ScriptSandboxApi,
  connectionId?: string | null,
): Promise<void> {
  const lang: UserScriptLanguage = script.language;

  if (!script.enabled) {
    return;
  }

  if (lang !== 'text') {
    if (!script.source || !script.source.trim()) {
      return;
    }
  } else {
    if (script.source == null) {
      return;
    }
  }

  switch (lang) {
    case 'javascript': {
      await runJavascript(script.source, api, connectionId);
      return;
    }

    case 'lua': {
      if (connectionId === undefined) runLuaSourceInBrowser(script.source, api);
      else runLuaInEngine(connectionId, script.source, api);
      return;
    }

    case 'python': {
      if (connectionId === undefined) await runPythonSourceInBrowser(script.source, api);
      else await runPythonInEngine(connectionId, script.source, api);
      return;
    }

    case 'typescript': {
      await runTypescript(script.source, api, connectionId);
      return;
    }

    case 'text': {
      await runPlainText(script.source, api);
      return;
    }

    default: {
      api.error?.(`[UserScript] Unsupported language: ${String(lang)}`);
      return;
    }
  }
}

/**
 * Convenience wrappers used by triggers, aliases, and timers.
 */

export async function runTriggerScript(
  script: TriggerScript,
  eventName: string,
  payload: unknown,
  baseApi: ScriptSandboxApi,
  connectionId?: string | null,
): Promise<void> {
  if (!script.enabled) return;

  if (script.eventName && script.eventName !== eventName) {
    return;
  }

  const api: ScriptSandboxApi = {
    ...baseApi,
    event: {
      name: eventName,
      payload,
    },
  };

  await runUserScript(script, api, connectionId);
}

export async function runAliasScript(
  script: AliasScript,
  inputText: string,
  baseApi: ScriptSandboxApi,
  connectionId?: string | null,
): Promise<void> {
  if (!script.enabled) return;

  const api: ScriptSandboxApi = {
    ...baseApi,
    event: {
      name: 'alias:input',
      payload: { inputText },
    },
  };

  await runUserScript(script, api, connectionId);
}

export async function runTimerScript(
  script: TimerScript,
  baseApi: ScriptSandboxApi,
  connectionId?: string | null,
): Promise<void> {
  if (!script.enabled) return;

  const api: ScriptSandboxApi = {
    ...baseApi,
    event: {
      name: 'game:tick',
      payload: { intervalMs: script.intervalMs },
    },
  };

  await runUserScript(script, api, connectionId);
}

/**
 * Helper to record an error in a ScriptErrorInfo array.
 */
export function pushScriptError(
  errors: ScriptErrorInfo[],
  script: AnyUserScript,
  message: string,
  stack?: string,
): ScriptErrorInfo[] {
  const info: ScriptErrorInfo = {
    scriptId: script.id,
    scriptName: script.name,
    kind: script.kind,
    message,
    stack,
    timestamp: Date.now(),
  };
  return [...errors, info];
}
