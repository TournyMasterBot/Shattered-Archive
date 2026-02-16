// apps/game-client/src/hooks/useUserVariables.ts
import { useEffect, useState, useCallback } from 'react';
import {
  getUserVariablesSnapshot,
  setNamedVariable,
  deleteNamedVariable,
} from '../features/userScripts/userVariablesStore';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

export function useUserVariables(connectionId?: string | null) {
  const [vars, setVars] = useState(() => getUserVariablesSnapshot(connectionId));

  useEffect(() => {
    setVars(getUserVariablesSnapshot(connectionId));
  }, [connectionId]);

  useEffect(() => {
    const dispose = ListenEvent<{ connectionId?: string }>(
      'shatteredarchive:userVariables-updated',
      (payload) => {
        const evConn = payload?.connectionId ?? 'default';
        const curConn = connectionId ?? 'default';
        if (evConn !== curConn) return;

        setVars(getUserVariablesSnapshot(connectionId));
      },
      { key: 'useUserVariables::window::userVariables-updated' },
    );

    return () => {
      try {
        dispose?.();
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
