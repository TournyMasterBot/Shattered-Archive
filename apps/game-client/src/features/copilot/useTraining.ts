import { useCallback, useEffect, useRef, useState } from 'react';
import type { CopilotApi, TrainingStatus } from './api';

/** What a refresh does while Copilot is off (or before the first poll): nothing. */
const NOTHING = async (): Promise<void> => undefined;

export interface TrainingState {
  /** What the server last said, or undefined until it has (and while Copilot is off, or the server cannot be reached). */
  status: TrainingStatus | undefined;
  /** Turn Claude training on or off. The status is read again afterwards, whatever the server answered. */
  set(on: boolean): Promise<void>;
}

/**
 * Polls `GET /training` while `enabled` (Copilot is on) and offers the switch. The server decides everything: the toggle is shown only
 * while it says the connection is the Simulacrum's, and a refusal (the connection moved, Copilot was turned off) simply shows as the
 * status it then has. Each poll is aborted on unmount; an unreachable server leaves the status unknown, never an error.
 */
export function useTraining(api: CopilotApi, enabled: boolean, intervalMs = 3000): TrainingState {
  const [status, setStatus] = useState<TrainingStatus | undefined>(undefined);
  const refresh = useRef<() => Promise<void>>(NOTHING);

  useEffect(() => {
    if (!enabled) return undefined; // nothing is requested while Copilot is off; the status below is hidden meanwhile
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      const result = await api.getTraining(controller.signal);
      if (controller.signal.aborted) return;
      setStatus(result.ok ? result.value : undefined);
    };
    refresh.current = poll;
    const loop = async (): Promise<void> => {
      await poll();
      if (!controller.signal.aborted) timer = setTimeout(() => void loop(), intervalMs);
    };
    void loop();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      refresh.current = NOTHING;
    };
  }, [api, enabled, intervalMs]);

  const set = useCallback(
    async (on: boolean): Promise<void> => {
      await api.setTraining(on, new AbortController().signal);
      await refresh.current();
    },
    [api],
  );

  // a status read while Copilot was on is not shown once it is off (and not shown again before the next poll answers)
  return { status: enabled ? status : undefined, set };
}
