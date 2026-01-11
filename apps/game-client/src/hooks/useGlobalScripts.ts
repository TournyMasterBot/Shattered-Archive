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

export function useGlobalScripts(connectionId?: string | null) {
  const [sources, setSources] = useState(() => getGlobalScriptsSnapshot(connectionId));
  const [vars, setVars] = useState<Record<string, unknown>>(() => getGlobalVarsSnapshot(connectionId));

  useEffect(() => {
    setSources(getGlobalScriptsSnapshot(connectionId));
    setVars(getGlobalVarsSnapshot(connectionId));
  }, [connectionId]);

  useEffect(() => {
    const onScripts = () => setSources(getGlobalScriptsSnapshot(connectionId));
    const onVars = () => setVars(getGlobalVarsSnapshot(connectionId));

    try {
      window.addEventListener('game:globalScripts-updated', onScripts as EventListener);
      window.addEventListener('game:globalVars-updated', onVars as EventListener);
    } catch {
      // ignore
    }

    return () => {
      try {
        window.removeEventListener('game:globalScripts-updated', onScripts as EventListener);
        window.removeEventListener('game:globalVars-updated', onVars as EventListener);
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
