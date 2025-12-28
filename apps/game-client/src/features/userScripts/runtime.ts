// apps/game-client/src/features/userScripts/runtime.ts
import ts from 'typescript';
import {
  AnyUserScript,
  AliasScript,
  TimerScript,
  TriggerScript,
  ScriptSandboxApi,
  ScriptErrorInfo,
  UserScriptLanguage,
} from './types';
import { runLuaSourceInBrowser } from './luaRuntime';
import { runPythonSourceInBrowser } from './pythonRuntime';

/**
 * Core JS sandbox runner.
 *
 * For now we use a simple `new Function` with an `api` parameter.
 * All user-facing capabilities are provided via that `api`.
 */
async function runJavascript(source: string, api: ScriptSandboxApi): Promise<void> {
  try {
    const fn = new Function(
      'api',
      `"use strict";
const { sendCommand, log, error, event } = api;
try {
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
    api.error('[UserScript:JS] Failed to compile or execute script', err?.message ?? String(err));
  }
}

/**
 * TypeScript runner: transpile TS -> JS, then reuse runJavascript.
 * No type-checking, just strip types / TS syntax.
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
    api.error('[UserScript:TS] Failed to transpile or execute script', err?.message ?? String(err));
  }
}

/**
 * Plain text runner:
 * - one command per line
 * - blank lines preserved (sent as empty string)
 * - NO trimming, NO normalization
 */
async function runPlainText(source: string, api: ScriptSandboxApi): Promise<void> {
  // Intentionally allow empty string and whitespace-only scripts:
  // user may be deliberately sending blank lines.
  const text = source ?? '';

  // Normalize to LF split, but preserve blank lines.
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    api.sendCommand(line);
  }
}

/**
 * Dispatch to the correct language runner.
 */
export async function runUserScript(script: AnyUserScript, api: ScriptSandboxApi): Promise<void> {
  const lang: UserScriptLanguage = script.language;

  // Disabled scripts do nothing
  if (!script.enabled) return;

  // For plain text scripts, we intentionally allow empty/whitespace-only source
  // because blank lines are meaningful (they should be sent as-is).
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
      api.error(`[UserScript] Unsupported language: ${String(lang)}`);
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

  // If the trigger is bound to a specific event, enforce it.
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
      name: 'timer:tick',
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
