import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AutoLevelConfig, AutoLevelRunState } from '../features/autoleveling/autoleveling-types';
import { AutoLevelingEngine } from '../features/autoleveling/autoleveling-engine';
import { createDefaultAutoLevelConfig } from '../features/autoleveling/autoleveling-defaults';
import { loadAutoLevelConfig, saveAutoLevelConfig } from '../features/autoleveling/autoleveling-storage';

function safeTerminalPayload(e: Event): string {
  const anyE: any = e as any;
  const d = anyE?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d.text === 'string') return d.text;
  if (d != null) return String(d);
  return '';
}

export function useAutoLeveling(connectionId: string) {
  const [config, setConfig] = useState<AutoLevelConfig>(() => {
    return loadAutoLevelConfig(connectionId, createDefaultAutoLevelConfig());
  });

  const [runState, setRunState] = useState<AutoLevelRunState>({ status: 'idle' });
  const [socketReady, setSocketReady] = useState(false);

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const send = useCallback(
    (cmd: string) => {
      try {
        window.dispatchEvent(
          new CustomEvent('game:send-command', {
            detail: { cmd, connectionId: connectionId ?? null },
          }),
        );
      } catch {
        // ignore
      }
    },
    [connectionId],
  );

  const engineRef = useRef<AutoLevelingEngine | null>(null);

  useEffect(() => {
    // Ensure clean baseline each time we bind a new connection
    setRunState({ status: 'idle' });

    const eng = new AutoLevelingEngine(configRef.current, send, setRunState);
    engineRef.current = eng;

    return () => {
      try {
        eng.stop();
      } catch {
        // ignore
      } finally {
        engineRef.current = null;
        setRunState({ status: 'idle' });
      }
    };
  }, [connectionId, send]);

  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  useEffect(() => {
    const handleOpen = () => setSocketReady(true);
    const handleClosed = () => setSocketReady(false);

    try {
      window.addEventListener('game:socket-open', handleOpen as EventListener);
      window.addEventListener('game:socket-closed', handleClosed as EventListener);
    } catch {
      // ignore
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

  useEffect(() => {
    if (socketReady) return;

    // If socket drops or isn't ready, stop and force state to idle so we don't stick on “Stopping…”
    try {
      engineRef.current?.stop();
    } finally {
      setRunState({ status: 'idle' });
    }
  }, [socketReady]);

  useEffect(() => {
    const onTerm = (e: Event) => {
      const text = safeTerminalPayload(e);
      if (!text) return;
      engineRef.current?.onTerminalData(text);
    };

    try {
      window.addEventListener('game:terminal-data', onTerm as EventListener);
    } catch {
      // ignore
    }

    return () => {
      try {
        window.removeEventListener('game:terminal-data', onTerm as EventListener);
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    saveAutoLevelConfig(connectionId, config);
  }, [connectionId, config]);

  const start = useCallback(() => {
    if (!socketReady) return;
    engineRef.current?.start();
  }, [socketReady]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(createDefaultAutoLevelConfig());
    setRunState({ status: 'idle' });
  }, []);

  return {
    config,
    setConfig,
    runState,
    socketReady,
    start,
    stop,
    resetToDefaults,
  };
}
