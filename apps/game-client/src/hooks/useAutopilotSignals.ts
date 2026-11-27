import { useEffect, useRef } from 'react';
import type { AutoLevelRunState } from '../features/autoleveling/autoleveling-types';
import { createAutopilotSignals } from '../features/autoleveling/autopilot-signals';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

/**
 * Tells the rest of the client what Autopilot is doing: `shatteredarchive:autopilot-status` on every status change, and
 * `shatteredarchive:autopilot-need-help` once when the run state becomes `error`. Called by useAutoLeveling with its run state.
 */
export function useAutopilotSignals(runState: AutoLevelRunState): void {
  const signals = useRef(createAutopilotSignals((name, payload) => DispatchEvent(name, payload)));
  useEffect(() => {
    signals.current.observe(runState);
  }, [runState]);
}
