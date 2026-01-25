// apps/game-client/src/hooks/useAutoLeveling.ts

/**
 * useAutoLeveling (React hook)
 * ----------------------------
 * Intent:
 * - Own the persisted config (localStorage) and expose helpers to update it.
 * - Create/bind/unbind the AutoLevelingEngine per connectionId.
 * - Provide UI gating:
 *   - socketReady is derived from game socket open/close events and is used to disable Start.
 * - Expose Start/Stop/Pause/Resume, plus event-bus handlers for external UI buttons/icons.
 *
 * Important separation of responsibilities:
 * - Hook owns config persistence and engine lifetime.
 * - Engine owns runtime behavior: movement gating, encounter detection/injection, engagement, waits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AutoLevelConfig, AutoLevelRunState } from '../features/autoleveling/autoleveling-types';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import {
  loadAutoLevelConfig,
  resetAutoLevelConfig,
  saveAutoLevelConfig,
} from '../features/autoleveling/autoleveling-storage';
import { AutoLevelingEngine } from '../features/autoleveling/autoleveling-engine';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

/* ----------------------------- debug helpers ------------------------------ */

const HOOK_LOG_PREFIX = '[autoleveling][hook]';

function isAutoLevelingDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__AUTOLEVELING_DEBUG__ === true) return true;

    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('autoleveling.debug') : null;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;

    try {
      const dev = typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV;
      return dev;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function hdbg(...args: any[]) {
  return;
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(HOOK_LOG_PREFIX, ...args);
}

function hwarn(...args: any[]) {
  return;
  if (!isAutoLevelingDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(HOOK_LOG_PREFIX, ...args);
}

/* ------------------------------------------------------------------------- */

export function useAutoLeveling(connectionId: string) {
  const [config, _setConfig] = useState<AutoLevelConfig>(() => {
    const initial = loadAutoLevelConfig(connectionId, createDefaultAutoLevelConfig());
    hdbg('init config loaded', { connectionId, enabled: initial.enabled, version: initial.version });
    return initial;
  });

  const configRef = useRef<AutoLevelConfig>(config);
  useEffect(() => {
    configRef.current = config;
    hdbg('config state updated', {
      enabled: config.enabled,
      loopRounds: config.loopRounds,
      idleTimeoutMs: config.idleTimeoutMs,
      roundDelay: config.roundLoopTimeMs,
    });
  }, [config]);

  const setConfig = useCallback(
    (next: AutoLevelConfig) => {
      hdbg('setConfig called', { enabled: next.enabled, version: next.version });
      _setConfig(next);
      saveAutoLevelConfig(connectionId, next);
    },
    [connectionId],
  );

  // socket readiness remains a UI safety gate
  const [socketReady, setSocketReady] = useState(false);
  useEffect(() => {
    const disposeOpen = ListenEvent<unknown>(
      'game:remote-server:open',
      () => {
        hdbg('socket open -> socketReady=true');
        setSocketReady(true);
      },
      { key: 'useUserScriptSandbox::socket::open' },
    );

    const disposeClose = ListenEvent<unknown>(
      'game:remote-server:close',
      () => {
        hdbg('socket closed -> socketReady=false');
        setSocketReady(false);
      },
      { key: 'useUserScriptSandbox::socket::close' },
    );

    return () => {
      try {
        disposeOpen?.();
      } catch {
        // ignore
      }
      try {
        disposeClose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const [runState, setRunState] = useState<AutoLevelRunState>({ status: 'idle' });
  /*useEffect(() => {
    hdbg('runState updated', runState);
  }, [runState]);*/

  const engineRef = useRef<AutoLevelingEngine | null>(null);

  // (Re)create engine when connection changes
  useEffect(() => {
    hdbg('engine create/bind', { connectionId });

    const eng = new AutoLevelingEngine({
      getConfig: () => configRef.current,
      setRunState: (s) => {
        hdbg('engine setRunState', s);
        setRunState(s);
      },
    });

    engineRef.current = eng;
    eng.bind();

    return () => {
      hdbg('engine cleanup', { connectionId });

      try {
        eng.stop();
      } catch (e) {
        hwarn('engine stop threw during cleanup', e);
      }

      try {
        eng.unbind();
      } catch (e) {
        hwarn('engine unbind threw during cleanup', e);
      }

      engineRef.current = null;
    };
  }, [connectionId]);

  const start = useCallback(async () => {
    hdbg('start() requested', { socketReady, status: runState.status });

    if (!socketReady) {
      hwarn('start() blocked: socketReady=false');
      return;
    }

    const eng = engineRef.current;
    if (!eng) {
      hwarn('start() blocked: no engine');
      return;
    }

    if (runState.status === 'running' || runState.status === 'paused') {
      hwarn('start() ignored: already running/paused');
      return;
    }

    await eng.start();
  }, [runState.status, socketReady]);

  const stop = useCallback(() => {
    hdbg('stop() requested', { status: runState.status });

    const eng = engineRef.current;
    if (!eng) {
      hwarn('stop() blocked: no engine');
      return;
    }

    eng.stop();
    setRunState({ status: 'idle' });
  }, [runState.status]);

  const pause = useCallback(() => {
    hdbg('pause() requested', { status: runState.status });

    const eng = engineRef.current;
    if (!eng) {
      hwarn('pause() blocked: no engine');
      return;
    }

    if (runState.status !== 'running') {
      hwarn('pause() ignored: not running');
      return;
    }

    eng.pause();
    setRunState((prev) =>
      prev.status === 'running'
        ? { status: 'paused', round: prev.round, step: prev.step, actionIndex: prev.actionIndex }
        : prev,
    );
  }, [runState.status]);

  const resume = useCallback(() => {
    hdbg('resume() requested', { status: runState.status });

    const eng = engineRef.current;
    if (!eng) {
      hwarn('resume() blocked: no engine');
      return;
    }

    if (runState.status !== 'paused') {
      hwarn('resume() ignored: not paused');
      return;
    }

    eng.resume();
    setRunState((prev) =>
      prev.status === 'paused'
        ? { status: 'running', round: prev.round, step: prev.step, actionIndex: prev.actionIndex }
        : prev,
    );
  }, [runState.status]);

  const resetToDefaults = useCallback(() => {
    hdbg('resetToDefaults() requested', { connectionId });

    const next = resetAutoLevelConfig(connectionId, createDefaultAutoLevelConfig());
    _setConfig(next);
    setRunState({ status: 'idle' });
  }, [connectionId]);

  // Event-bus controls (crossed swords etc)
  useEffect(() => {
    const disposeStart = ListenEvent(
      'shatteredarchive:autoleveling-start',
      () => {
        hdbg('event: game:autoleveling-start');
        start();
      },
      { key: 'useAutoLeveling::window::autoleveling-start' },
    );

    const disposePause = ListenEvent(
      'shatteredarchive:autoleveling-pause',
      () => {
        hdbg('event: game:autoleveling-pause');
        pause();
      },
      { key: 'useAutoLeveling::window::autoleveling-pause' },
    );

    const disposeResume = ListenEvent(
      'shatteredarchive:autoleveling-resume',
      () => {
        hdbg('event: game:autoleveling-resume');
        resume();
      },
      { key: 'useAutoLeveling::window::autoleveling-resume' },
    );

    const disposeStop = ListenEvent(
      'shatteredarchive:autoleveling-stop',
      () => {
        hdbg('event: game:autoleveling-stop');
        stop();
      },
      { key: 'useAutoLeveling::window::autoleveling-stop' },
    );

    return () => {
      try {
        disposeStart?.();
        disposePause?.();
        disposeResume?.();
        disposeStop?.();
      } catch {
        // ignore
      }
    };
  }, [pause, resume, start, stop]);

  return {
    config,
    setConfig,

    runState,
    socketReady,

    start,
    stop,
    pause,
    resume,
    resetToDefaults,
  };
}
