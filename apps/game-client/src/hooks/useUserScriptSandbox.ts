// apps\game-client\src\hooks\useUserScriptSandbox.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AnyUserScript,
  TriggerScript,
  AliasScript,
  TimerScript,
  ScriptErrorInfo,
  ScriptSandboxApi,
  UserScriptKind,
} from '../features/userScripts/types';
import { runUserScript, runTimerScript } from '../features/userScripts/runtime';
import { setOmitRules } from '../features/userScripts/triggerOmitStore';
import { invokeGlobalById } from '../features/userScripts/globalRuntime';
import { getGlobalVar, setGlobalVar, deleteGlobalVar } from '../features/userScripts/globalScriptsStore';
import { getUserVariablesSnapshot } from '../features/userScripts/userVariablesStore';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

const STORAGE_KEY_PREFIX = 'shatteredArchive.userScripts.';

type TimerMap = Record<string, number>;

export function getUserScriptStorageKey(connectionId?: string | null) {
  const safe = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `${STORAGE_KEY_PREFIX}${safe}`;
}

function makeErrorInfo(script: AnyUserScript, kind: UserScriptKind, err: unknown): ScriptErrorInfo {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const stack = err instanceof Error ? err.stack : undefined;

  return {
    scriptId: script.id,
    scriptName: script.name,
    kind,
    message,
    stack,
    timestamp: Date.now(),
  };
}

/* ----------------------------------------------------------
   DSL → ANSI mapping (same semantics as runtimeSingleton)
   - No auto-reset; callers should end with {x to clear.
---------------------------------------------------------- */

const DSL_ANSI_COLORS: Record<string, string> = {
  '{r': '\u001b[31m', // red
  '{R': '\u001b[91m', // Lt Red

  '{g': '\u001b[32m', // green
  '{G': '\u001b[92m', // Lt Green

  '{y': '\u001b[33m', // yellow
  '{Y': '\u001b[93m', // Lt Yellow

  '{b': '\u001b[34m', // blue
  '{B': '\u001b[94m', // Lt Blue

  '{m': '\u001b[35m', // magenta
  '{M': '\u001b[95m', // Lt Magenta

  '{c': '\u001b[36m', // cyan
  '{C': '\u001b[96m', // Lt Cyan

  '{D': '\u001b[30m', // black
  '{w': '\u001b[37m', // Grey
  '{W': '\u001b[97m', // Lt White

  '{o': '\u001b[38;5;208m', // orange
  '{n': '\u001b[38;5;130m', // brown
  '{p': '\u001b[38;5;213m', // pink
  '{u': '\u001b[38;5;141m', // purple
};

function dslToAnsi(input: string): string {
  if (!input) return '';

  let out = '';
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '{' && i + 1 < input.length) {
      const next = input[i + 1];

      // Literal '{' → '{{'
      if (next === '{') {
        out += '{';
        i += 2;
        continue;
      }

      const code = input.slice(i, i + 2);

      // Reset
      if (code === '{x') {
        out += '\u001b[0m';
        i += 2;
        continue;
      }

      // Bell icon (preview-style)
      if (code === '{!') {
        out += '🔔';
        i += 2;
        continue;
      }

      // Literal tilde
      if (code === '{-') {
        out += '~';
        i += 2;
        continue;
      }

      // Reverse video
      if (code === '{&') {
        out += '\u001b[7m';
        i += 2;
        continue;
      }

      // Underline
      if (code === '{_') {
        out += '\u001b[4m';
        i += 2;
        continue;
      }

      const ansi = DSL_ANSI_COLORS[code];
      if (ansi) {
        out += ansi;
        i += 2;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function makeApiBase(
  script: AnyUserScript,
  pushError: (info: ScriptErrorInfo) => void,
  extra?: Partial<ScriptSandboxApi>,
  connectionId?: string | null,
): ScriptSandboxApi {
  const api: ScriptSandboxApi = {
    sendCommand: (cmd: string) => {
      DispatchEvent('game:send-command', { cmd, connectionId });
    },
    log: (...args: unknown[]) => {
      console.log(`[UserScript:${script.name}]`, ...args);
    },
    error: (...args: unknown[]) => {
      console.error(`[UserScript:${script.name}]`, ...args);
    },
    event: extra?.event,

    // NEW: allow scripts tested in the sandbox to write DSL-colored text
    // directly to the xterm terminal via bypass event.
    writeTerminal: (dsl: string) => {
      if (!dsl) return;

      try {
        const ansi = dslToAnsi(dsl);
        DispatchEvent('shatteredarchive:write-terminal', {
          rawText: ansi,
          fromUserScript: true
        })
      } catch (err) {
        console.error('[UserScriptSandbox writeTerminal] failed', err);
      }
    },

    // NEW: invoke global scripts by identifier
    runGlobal: async (globalId: string, args?: unknown) => {
      try {
        return await invokeGlobalById(connectionId ?? 'default', globalId, api, args);
      } catch (err) {
        api.error?.('[UserScript runGlobal] failed', err instanceof Error ? err.message : String(err));
        return undefined;
      }
    },

    // NEW: global variable KV store
    getGlobalVar: (key: string) => getGlobalVar(connectionId ?? 'default', key),
    setGlobalVar: (key: string, value: unknown) => setGlobalVar(connectionId ?? 'default', key, value),
    deleteGlobalVar: (key: string) => deleteGlobalVar(connectionId ?? 'default', key),

    // NEW: named variables for "{NAME}" (trigger/alias templates)
    getNamedVar: (name: string) => {
      const vars = getUserVariablesSnapshot(connectionId ?? 'default');
      return vars?.[name];
    },
  };

  // Allow overrides if the hook wants to inject a custom sender/log/error/writeTerminal
  if (extra?.sendCommand) api.sendCommand = extra.sendCommand;
  if (extra?.log) api.log = extra.log;
  if (extra?.error) api.error = extra.error;
  if (extra?.event) api.event = extra.event;
  if (extra?.writeTerminal) api.writeTerminal = extra.writeTerminal;
  if (extra?.runGlobal) api.runGlobal = extra.runGlobal;
  if (extra?.getGlobalVar) api.getGlobalVar = extra.getGlobalVar;
  if (extra?.setGlobalVar) api.setGlobalVar = extra.setGlobalVar;
  if (extra?.deleteGlobalVar) api.deleteGlobalVar = extra.deleteGlobalVar;
  if (extra?.getNamedVar) api.getNamedVar = extra.getNamedVar;

  api.httpGetJson = async (
    url: string,
    options?: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<unknown> => {
    try {
      const init: RequestInit = {
        method: options?.method ?? 'GET',
        headers: options?.headers ? { ...options.headers } : undefined,
      };

      if (options?.body !== undefined) {
        if (!init.headers) init.headers = {};
        if (!('Content-Type' in init.headers)) {
          (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }

        init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }

      const res = await fetch(url, init);
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ''} – ${text.slice(0, 200)}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (err) {
      api.error('[UserScript:httpGetJson] Request failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  // Wrap error() so it also records to error list
  const originalError = api.error;
  api.error = (...args: unknown[]) => {
    originalError(...args);
    const errMsg = args.map((x) => String(x)).join(' ');
    const info: ScriptErrorInfo = {
      scriptId: script.id,
      scriptName: script.name,
      kind: script.kind,
      message: errMsg,
      timestamp: Date.now(),
    };
    pushError(info);
  };

  return api;
}

export function useUserScriptSandbox(connectionId?: string | null) {
  const [scripts, setScripts] = useState<AnyUserScript[] | null>(null);
  const [errors, setErrors] = useState<ScriptErrorInfo[]>([]);
  const timersRef = useRef<TimerMap>({});
  const [socketReady, setSocketReady] = useState(false);

  const pushError = useCallback((info: ScriptErrorInfo) => {
    setErrors((prev) => [...prev, info]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const clearAllTimers = useCallback(() => {
    const timersCleanup = timersRef.current;
    Object.values(timersCleanup).forEach((id) => window.clearInterval(id));
    timersRef.current = {};
  }, []);

  // Track socket open/closed from useGameConnection
  useEffect(() => {
    const handleOpen = () => setSocketReady(true);
    const handleClosed = () => setSocketReady(false);

    try {
      window.addEventListener('game:socket-open', handleOpen as EventListener);
      window.addEventListener('game:socket-closed', handleClosed as EventListener);
    } catch {
      // ignore (SSR)
    }

    return () => {
      try {
        window.removeEventListener('game:socket-open', handleOpen as EventListener);
        window.removeEventListener('game:socket-closed', handleClosed as EventListener);
      } catch {
        // ignore
      }
    };
  }, []);

  // Load from localStorage whenever connection changes
  useEffect(() => {
    if (typeof window === 'undefined') {
      setScripts([]);
      return;
    }

    const key = getUserScriptStorageKey(connectionId);

    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setScripts(parsed as AnyUserScript[]);
          return;
        }
      }
      setScripts([]);
    } catch (err) {
      console.error('[UserScriptSandbox] Failed to load scripts:', err);
      setScripts([]);
    }
  }, [connectionId]);

  // Persist to localStorage whenever scripts change, but only after hydration
  useEffect(() => {
    if (!scripts) return;
    if (typeof window === 'undefined') return;

    const key = getUserScriptStorageKey(connectionId);

    try {
      window.localStorage.setItem(key, JSON.stringify(scripts));
      try {
        window.dispatchEvent(
          new CustomEvent('game:userScripts-updated', {
            detail: { connectionId: connectionId ?? 'default' },
          }),
        );
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('[UserScriptSandbox] Failed to save scripts:', err);
    }
  }, [scripts, connectionId]);

  useEffect(() => {
    if (!scripts) {
      setOmitRules([]);
      return;
    }

    const omitRules = scripts
      .filter((s) => s.kind === 'trigger' && s.enabled)
      .filter((s: any) => !!s.omitFromOutput)
      .flatMap((s: any) => {
        const matchText = s.matchText || '';
        // support both block + line
        return [
          { id: `${s.id}:line`, eventName: 'event:line', matchText, caseInsensitive: true },
          //{ id: `${s.id}:block`, eventName: 'game:terminal-data', matchText, caseInsensitive: true },
        ];
      });

    setOmitRules(omitRules);
  }, [scripts]);

  // Manage timers whenever scripts, socket state, or connection change
  useEffect(() => {
    if (!scripts || !socketReady) {
      // If socket isn't ready, clear any existing timers and do nothing.
      clearAllTimers();
      return;
    }

    const safeScripts = scripts;

    // Clear existing timers before recreating
    clearAllTimers();

    safeScripts.forEach((script) => {
      if (script.kind !== 'timer') return;
      const timer = script as TimerScript;
      if (!timer.enabled || timer.intervalMs <= 0) return;

      // Wait full interval before first fire
      const intervalId = window.setInterval(() => {
        const current = safeScripts.find((s) => s.id === timer.id);
        if (!current || current.kind !== 'timer' || !current.enabled) {
          return;
        }
        const currentApi = makeApiBase(current, pushError, undefined, connectionId);
        void runTimerScript(current as TimerScript, currentApi);
      }, timer.intervalMs);

      timersRef.current[timer.id] = intervalId;
    });

    return () => {
      clearAllTimers();
    };
  }, [scripts, socketReady, pushError, connectionId, clearAllTimers]);

  const createTrigger = useCallback((partial: Omit<TriggerScript, 'id' | 'kind'>): TriggerScript => {
    const script: TriggerScript = {
      ...partial,
      id: crypto.randomUUID(),
      kind: 'trigger',
    };
    setScripts((prev) => {
      const base = prev ?? [];
      return [...base, script];
    });
    return script;
  }, []);

  const createAlias = useCallback((partial: Omit<AliasScript, 'id' | 'kind'>): AliasScript => {
    const script: AliasScript = {
      ...partial,
      id: crypto.randomUUID(),
      kind: 'alias',
    };
    setScripts((prev) => {
      const base = prev ?? [];
      return [...base, script];
    });
    return script;
  }, []);

  const createTimer = useCallback((partial: Omit<TimerScript, 'id' | 'kind'>): TimerScript => {
    const script: TimerScript = {
      ...partial,
      id: crypto.randomUUID(),
      kind: 'timer',
    };
    setScripts((prev) => {
      const base = prev ?? [];
      return [...base, script];
    });
    return script;
  }, []);

  const upsertScript = useCallback((script: AnyUserScript) => {
    setScripts((prev) => {
      const base = prev ?? [];
      const idx = base.findIndex((s) => s.id === script.id);
      if (idx === -1) return [...base, script];
      const next = [...base];
      next[idx] = script;
      return next;
    });
  }, []);

  const removeScript = useCallback((id: string) => {
    setScripts((prev) => {
      const base = prev ?? [];
      return base.filter((s) => s.id !== id);
    });
  }, []);

  const setScriptEnabled = useCallback((id: string, enabled: boolean) => {
    setScripts((prev) => {
      const base = prev ?? [];
      return base.map((s) =>
        s.id === id
          ? {
              ...s,
              enabled,
            }
          : s,
      );
    });
  }, []);

  const runScriptNow = useCallback(
    (script: AnyUserScript, extraApi?: Partial<ScriptSandboxApi>) => {
      const api = makeApiBase(script, pushError, extraApi, connectionId);
      void runUserScript(script, api);
    },
    [pushError, connectionId],
  );

  // Import/Export helpers (used by UI)
  const replaceAllScripts = useCallback((nextScripts: AnyUserScript[]) => {
    setScripts(() => [...(nextScripts ?? [])]);
  }, []);

  const mergeScripts = useCallback((incoming: AnyUserScript[]) => {
    let imported = 0;
    let skipped = 0;

    setScripts((prev) => {
      const base = prev ? [...prev] : [];
      const byId = new Map<string, number>();
      base.forEach((s, idx) => byId.set(s.id, idx));

      for (const s of incoming ?? []) {
        if (!s || typeof s.id !== 'string' || s.id.trim().length === 0) {
          skipped++;
          continue;
        }

        const idx = byId.get(s.id);
        if (idx == null) {
          base.push(s);
          byId.set(s.id, base.length - 1);
          imported++;
        } else {
          base[idx] = s;
          imported++;
        }
      }

      return base;
    });

    return { imported, skipped };
  }, []);

  const safeScripts = scripts ?? [];

  return {
    scripts: safeScripts,
    errors,
    clearErrors,
    createTrigger,
    createAlias,
    createTimer,
    upsertScript,
    removeScript,
    setScriptEnabled,
    runScriptNow,
    mergeScripts,
    replaceAllScripts,
  };
}
