import { useEffect, useRef, useState } from 'react';
import type { CopilotApi, ServerState } from './api';

/** `checking` until the first answer; `offline` when the server cannot be reached; `stale` when it answers but the game log has gone quiet. */
export type ServerStatus = 'off' | 'checking' | 'online' | 'stale' | 'offline';

/**
 * Polls `GET /state` while mounted and reports the status. Each poll is aborted on unmount, and no poll is started after it. An
 * offline server is a status, never an error. While `enabled` is false (Copilot is switched off) nothing is requested and the status
 * is `off`; switching on starts the polling again from `checking`, switching off aborts the one in flight.
 */
export function useServerStatus(api: CopilotApi, intervalMs = 3000, enabled = true, onState?: (state: ServerState) => void): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking');
  // the newest callback, read when an answer arrives (changing it must not restart the polling)
  const latest = useRef(onState);
  useEffect(() => {
    latest.current = onState;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      const result = await api.getState(controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        setStatus(result.value.stale ? 'stale' : 'online');
        latest.current?.(result.value);
      }
      else setStatus('offline'); // unreachable, an error status, or an answer that is not Copilot's
      timer = setTimeout(() => void poll(), intervalMs);
    };
    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      setStatus('checking'); // the next run (switched on again, a new address) starts from not knowing
    };
  }, [api, intervalMs, enabled]);

  return enabled ? status : 'off';
}
