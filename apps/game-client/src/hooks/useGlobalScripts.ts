// apps/game-client/src/hooks/useGlobalScripts.ts
import { useEffect, useState, useCallback } from 'react';
import type { GlobalScriptLanguage } from '../features/userScripts/globalScriptsStore';
import {
  getGlobalScriptsSnapshot,
  setGlobalScriptSource,
  getGlobalVarsSnapshot,
  setGlobalVar,
  deleteGlobalVar,
} from '../features/userScripts/globalScriptsStore';
import { invalidateGlobalRuntime } from '../features/userScripts/globalRuntime';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

export function useGlobalScripts(connectionId?: string | null) {
  const [sources, setSources] = useState(() => getGlobalScriptsSnapshot(connectionId));
  const [vars, setVars] = useState<Record<string, unknown>>(() => getGlobalVarsSnapshot(connectionId));

  useEffect(() => {
    setSources(getGlobalScriptsSnapshot(connectionId));
    setVars(getGlobalVarsSnapshot(connectionId));
  }, [connectionId]);

  useEffect(() => {
    const safeId = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';

    const disposeScripts = ListenEvent<any>(
      'shatteredarchive:globalScripts-updated',
      () => {
        setSources(getGlobalScriptsSnapshot(connectionId));
      },
      { key: `useGlobalScripts::globalScripts-updated::${safeId}` },
    );

    const disposeVars = ListenEvent<any>(
      'shatteredarchive:globalVars-updated',
      () => {
        setVars(getGlobalVarsSnapshot(connectionId));
      },
      { key: `useGlobalScripts::globalVars-updated::${safeId}` },
    );

    return () => {
      try {
        disposeScripts?.();
      } catch {
        // ignore
      }
      try {
        disposeVars?.();
      } catch {
        // ignore
      }
    };
  }, [connectionId]);

  const saveSource = useCallback(
    (language: GlobalScriptLanguage, source: string) => {
      setGlobalScriptSource(connectionId, language, source);
      invalidateGlobalRuntime(connectionId, language);
    },
    [connectionId],
  );

  const setVar = useCallback(
    (key: string, value: unknown) => {
      setGlobalVar(connectionId, key, value);
      setVars(getGlobalVarsSnapshot(connectionId));
    },
    [connectionId],
  );

  const removeVar = useCallback(
    (key: string) => {
      deleteGlobalVar(connectionId, key);
      setVars(getGlobalVarsSnapshot(connectionId));
    },
    [connectionId],
  );

  return {
    sources,
    saveSource,
    vars,
    setVar,
    removeVar,
  };
}
