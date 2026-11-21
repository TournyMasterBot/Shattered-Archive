import type { AutoLevelRunState } from './autoleveling-types';

export type SignalDispatch = (name: string, payload: object) => void;

/**
 * Tells the rest of the client what Autopilot is doing, over the event bus, without knowing who listens:
 *
 * - `shatteredarchive:autopilot-status` `{ status }` whenever the run status CHANGES (the Copilot command gate reads it);
 * - `shatteredarchive:autopilot-need-help` `{ reason: 'error', message }` once, when the status becomes `error`. A repeat error
 *   while it is still in `error` does not emit again; leaving `error` and entering it later does.
 * - `shatteredarchive:autopilot-need-help` `{ reason: 'timeout', message }` once, when the status becomes `paused` because the engine paused
 *   itself after something it waited for never came (a movement reply, the end of a fight). A pause by the player or a flee is not a call for help.
 *
 * `idle` is the assumed start, so a run state that stays `idle` is silent.
 */
export function createAutopilotSignals(dispatch: SignalDispatch) {
  let last: AutoLevelRunState['status'] = 'idle';
  return {
    observe(state: AutoLevelRunState): void {
      if (state.status === last) return;
      last = state.status;
      dispatch('shatteredarchive:autopilot-status', { status: state.status });
      if (state.status === 'error') dispatch('shatteredarchive:autopilot-need-help', { reason: 'error', message: state.message });
      if (state.status === 'paused' && state.reason === 'timeout') {
        dispatch('shatteredarchive:autopilot-need-help', { reason: 'timeout', message: state.message });
      }
    },
  };
}
