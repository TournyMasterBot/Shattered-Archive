// apps/game-client/src/hooks/useAutoLeveling.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AutoLevelConfig, AutoLevelRunState } from '../features/autoleveling/autoleveling-types';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import { loadAutoLevelConfig, resetAutoLevelConfig, saveAutoLevelConfig } from '../features/autoleveling/autoleveling-storage';
import { AutoLevelingEngine } from '../features/autoleveling/autoleveling-engine';

export function useAutoLeveling(connectionId: string) {
  const [config, _setConfig] = useState<AutoLevelConfig>(() => loadAutoLevelConfig(connectionId, createDefaultAutoLevelConfig()));
  const configRef = useRef<AutoLevelConfig>(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const setConfig = useCallback(
    (next: AutoLevelConfig) => {
      _setConfig(next);
      saveAutoLevelConfig(connectionId, next);
    },
    [connectionId],
  );

  // socket readiness remains a UI safety gate
  const [socketReady, setSocketReady] = useState(false);
  useEffect(() => {
    const onOpen = () => setSocketReady(true);
    const onClose = () => setSocketReady(false);
    window.addEventListener('game:socket-open', onOpen as EventListener);
    window.addEventListener('game:socket-closed', onClose as EventListener);
    return () => {
      window.removeEventListener('game:socket-open', onOpen as EventListener);
      window.removeEventListener('game:socket-closed', onClose as EventListener);
    };
  }, []);

  const [runState, setRunState] = useState<AutoLevelRunState>({ status: 'idle' });

  const engineRef = useRef<AutoLevelingEngine | null>(null);

  // (Re)create engine when connection changes
  useEffect(() => {
    const eng = new AutoLevelingEngine({
      getConfig: () => configRef.current,
      setRunState,
    });

    engineRef.current = eng;
    eng.bind();

    return () => {
      try {
        eng.stop();
      } catch {
        // ignore
      }
      try {
        eng.unbind();
      } catch {
        // ignore
      }
      engineRef.current = null;
    };
  }, [connectionId]);

  const start = useCallback(async () => {
    if (!socketReady) return;
    const eng = engineRef.current;
    if (!eng) return;

    if (runState.status === 'running' || runState.status === 'paused') return;

    await eng.start();
  }, [runState.status, socketReady]);

  const stop = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.stop();
    setRunState({ status: 'idle' });
  }, []);

  const pause = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (runState.status !== 'running') return;
    eng.pause();
    setRunState((prev) => (prev.status === 'running' ? { status: 'paused', round: prev.round, step: prev.step, actionIndex: prev.actionIndex } : prev));
  }, [runState.status]);

  const resume = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (runState.status !== 'paused') return;
    eng.resume();
    setRunState((prev) => (prev.status === 'paused' ? { status: 'running', round: prev.round, step: prev.step, actionIndex: prev.actionIndex } : prev));
  }, [runState.status]);

  const resetToDefaults = useCallback(() => {
    const next = resetAutoLevelConfig(connectionId, createDefaultAutoLevelConfig());
    _setConfig(next);
    setRunState({ status: 'idle' });
  }, [connectionId]);

  // Event-bus controls (crossed swords etc)
  useEffect(() => {
    const onStart = () => start();
    const onPause = () => pause();
    const onResume = () => resume();
    const onStop = () => stop();

    window.addEventListener('game:autoleveling-start', onStart as EventListener);
    window.addEventListener('game:autoleveling-pause', onPause as EventListener);
    window.addEventListener('game:autoleveling-resume', onResume as EventListener);
    window.addEventListener('game:autoleveling-stop', onStop as EventListener);

    return () => {
      window.removeEventListener('game:autoleveling-start', onStart as EventListener);
      window.removeEventListener('game:autoleveling-pause', onPause as EventListener);
      window.removeEventListener('game:autoleveling-resume', onResume as EventListener);
      window.removeEventListener('game:autoleveling-stop', onStop as EventListener);
    };
  }, [pause, resume, start, stop]);

  // If someone else updated storage (rare), you can add a reload event later. For now: UI is source-of-truth while open.

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
