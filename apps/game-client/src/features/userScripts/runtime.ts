import ts from 'typescript';
import { AnyUserScript, AliasScript, TimerScript, TriggerScript, ScriptSandboxApi, UserScriptLanguage } from './types';
import { runLuaSourceInBrowser } from './luaRuntime';
import { runPythonSourceInBrowser } from './pythonRuntime';
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
  lines.push(
    `const __vars = (event && event.payload && event.payload.vars) ? event.payload.vars : {};`,
  );

  for (const k of keys) {
    const key = String(k ?? '').trim();
    if (!key) continue;
    if (!isValidJsIdentifier(key)) continue;

    // Example: const TARGET = __vars["TARGET"];
    lines.push(`const ${key} = __vars[${JSON.stringify(key)}];`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Core JS sandbox runner.
 */
async function runJavascript(source: string, api: ScriptSandboxApi): Promise<void> {
  try {
    const varPrelude = buildAliasVarsPrelude(api);

    const fn = new Function(
      'api',
      `"use strict";
const {
  sendCommand,
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
try {
${varPrelude}
${source}
} catch (err) {
  error(
    "[UserScript:JS] Runtime error",
    err && err.message ? err.message : String(err)
  );
}`,
    );

    await fn(api);
  } catch (err: any) {
    api.error?.('[UserScript:JS] Failed to compile or execute script', err?.message ?? String(err));
  }
}

/**
 * TypeScript runner: transpile TS -> JS, then reuse runJavascript.
 */
async function runTypescript(source: string, api: ScriptSandboxApi): Promise<void> {
  try {
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2018,
        strict: false,
      },
    });

    await runJavascript(outputText, api);
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
 */
export async function runUserScript(script: AnyUserScript, api: ScriptSandboxApi): Promise<void> {
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
      await runJavascript(script.source, api);
      return;
    }

    case 'lua': {
      await runLuaSourceInBrowser(script.source, api);
      return;
    }

    case 'python': {
      await runPythonSourceInBrowser(script.source, api);
      return;
    }

    case 'typescript': {
      await runTypescript(script.source, api);
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

  await runUserScript(script, api);
}

export async function runAliasScript(script: AliasScript, inputText: string, baseApi: ScriptSandboxApi): Promise<void> {
  if (!script.enabled) return;

  const api: ScriptSandboxApi = {
    ...baseApi,
    event: {
      name: 'alias:input',
      payload: { inputText },
    },
  };

  await runUserScript(script, api);
}

export async function runTimerScript(script: TimerScript, baseApi: ScriptSandboxApi): Promise<void> {
  if (!script.enabled) return;

  const api: ScriptSandboxApi = {
    ...baseApi,
    event: {
      name: 'game:tick',
      payload: { intervalMs: script.intervalMs },
    },
  };

  await runUserScript(script, api);
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
