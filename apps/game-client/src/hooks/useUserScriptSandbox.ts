// apps/game-client/src/hooks/useUserScriptSandbox.ts
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

const STORAGE_KEY_PREFIX = 'shatteredArchive.userScripts.';

type TimerMap = Record<string, number>;

function getStorageKey(connectionId?: string | null) {
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

function makeApiBase(
  script: AnyUserScript,
  pushError: (info: ScriptErrorInfo) => void,
  extra?: Partial<ScriptSandboxApi>,
  connectionId?: string | null,
): ScriptSandboxApi {
  const api: ScriptSandboxApi = {
    sendCommand: (cmd: string) => {
      // Primary behavior: emit a browser event so useGameConnection can handle it.
      try {
        window.dispatchEvent(
          new CustomEvent('game:send-command', {
            detail: { cmd, connectionId: connectionId ?? null },
          }),
        );
      } catch {
        // Fallback if window is not available
        console.log(`[UserScript sendCommand fallback] (${script.name})`, cmd);
      }
    },
    log: (...args: unknown[]) => {
      console.log(`[UserScript:${script.name}]`, ...args);
    },
    error: (...args: unknown[]) => {
      console.error(`[UserScript:${script.name}]`, ...args);
    },
    event: extra?.event,
  };

  // Allow overrides if the hook wants to inject a custom sender
  if (extra?.sendCommand) api.sendCommand = extra.sendCommand;
  if (extra?.log) api.log = extra.log;
  if (extra?.error) api.error = extra.error;
  if (extra?.event) api.event = extra.event;

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

    const key = getStorageKey(connectionId);

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

    const key = getStorageKey(connectionId);

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
          { id: `${s.id}:line`, eventName: 'text:line', matchText, caseInsensitive: true },
          { id: `${s.id}:block`, eventName: 'game:terminal-data', matchText, caseInsensitive: true },
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
  };
}
