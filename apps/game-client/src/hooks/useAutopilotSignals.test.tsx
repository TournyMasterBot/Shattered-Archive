import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { AutoLevelRunState } from '../features/autoleveling/autoleveling-types';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import { useAutopilotSignals } from './useAutopilotSignals';

function listen() {
  const status: string[] = [];
  const help: { reason: string; message: string }[] = [];
  const stops = [
    ListenEvent<{ status: string }>('shatteredarchive:autopilot-status', (p) => status.push(p.status), { key: 'signals-test::status' }),
    ListenEvent<{ reason: string; message: string }>('shatteredarchive:autopilot-need-help', (p) => help.push(p), { key: 'signals-test::help' }),
  ];
  return { status, help, stop: () => stops.forEach((s) => s()) };
}

/** A component stand-in for useAutoLeveling: it owns a run state and reports it. */
function useRun() {
  const [state, setState] = useState<AutoLevelRunState>({ status: 'idle' });
  useAutopilotSignals(state);
  return setState;
}

describe('useAutopilotSignals (used by useAutoLeveling)', () => {
  it('emits one need-help when the run state becomes error, and not again for a repeat error', () => {
    const heard = listen();
    const { result } = renderHook(useRun);
    act(() => result.current({ status: 'running', round: 1, step: 'move', actionIndex: 0 }));
    act(() => result.current({ status: 'error', message: 'No route to the area' }));
    act(() => result.current({ status: 'error', message: 'Still no route' }));
    expect(heard.help).toEqual([{ reason: 'error', message: 'No route to the area' }]);
    expect(heard.status).toEqual(['running', 'error']);
    heard.stop();
  });

  it('emits again after the error was left and a new one happens', () => {
    const heard = listen();
    const { result } = renderHook(useRun);
    act(() => result.current({ status: 'error', message: 'first' }));
    act(() => result.current({ status: 'idle' }));
    act(() => result.current({ status: 'error', message: 'second' }));
    expect(heard.help.map((h) => h.message)).toEqual(['first', 'second']);
    heard.stop();
  });

  it('says nothing while Autopilot stays idle', () => {
    const heard = listen();
    renderHook(useRun);
    expect(heard.status).toEqual([]);
    expect(heard.help).toEqual([]);
    heard.stop();
  });
});
