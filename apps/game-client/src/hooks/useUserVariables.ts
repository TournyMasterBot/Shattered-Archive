// apps/game-client/src/hooks/useUserVariables.ts
import { useEffect, useState, useCallback } from 'react';
import {
  getUserVariablesSnapshot,
  setNamedVariable,
  deleteNamedVariable,
} from '../features/userScripts/userVariablesStore';

export function useUserVariables(connectionId?: string | null) {
  const [vars, setVars] = useState(() => getUserVariablesSnapshot(connectionId));

  useEffect(() => {
    setVars(getUserVariablesSnapshot(connectionId));
  }, [connectionId]);

  useEffect(() => {
    const onUpdate = () => setVars(getUserVariablesSnapshot(connectionId));

    try {
      window.addEventListener('game:userVariables-updated', onUpdate as EventListener);
    } catch {
      // ignore
    }

    return () => {
      try {
        window.removeEventListener('game:userVariables-updated', onUpdate as EventListener);
      } catch {
        // ignore
      }
    };
  }, [connectionId]);

  const setVar = useCallback(
    (name: string, value: string) => {
      setNamedVariable(connectionId, name, value);
      setVars(getUserVariablesSnapshot(connectionId));
    },
    [connectionId],
  );

  const removeVar = useCallback(
    (name: string) => {
      deleteNamedVariable(connectionId, name);
      setVars(getUserVariablesSnapshot(connectionId));
    },
    [connectionId],
  );

  return { vars, setVar, removeVar };
}
