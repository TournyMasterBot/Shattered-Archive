import { act, renderHook } from '@testing-library/react';
import type { ApiResult, CopilotApi, ServerState } from './api';
import { useServerStatus } from './useServerStatus';

const state = (over: Partial<ServerState> = {}): ServerState => ({ connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null, ...over });

function fakeApi(answers: (() => Promise<ApiResult<ServerState>>)[]) {
  let n = 0;
  const signals: AbortSignal[] = [];
  const api = {
    getState: (signal: AbortSignal) => {
      signals.push(signal);
      return answers[Math.min(n++, answers.length - 1)]();
    },
  } as unknown as CopilotApi;
  return { api, signals, calls: () => n };
}

const flush = () => act(async () => void (await Promise.resolve()));

describe('useServerStatus', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is checking, then online when the server answers and the game is live', async () => {
    const { api } = fakeApi([async () => ({ ok: true, value: state() })]);
    const { result } = renderHook(() => useServerStatus(api));
    expect(result.current).toBe('checking');
    await flush();
    expect(result.current).toBe('online');
  });

  it('is stale when the server answers but the game log has gone quiet', async () => {
    const { api } = fakeApi([async () => ({ ok: true, value: state({ stale: true }) })]);
    const { result } = renderHook(() => useServerStatus(api));
    await flush();
    expect(result.current).toBe('stale');
  });

  it.each([
    ['unreachable', 'offline'],
    ['an error status', 'http'],
    ['an answer that is not Copilot', 'invalid'],
  ] as const)('is offline when the server is %s', async (_label, reason) => {
    const { api } = fakeApi([async () => ({ ok: false, reason })]);
    const { result } = renderHook(() => useServerStatus(api));
    await flush();
    expect(result.current).toBe('offline');
  });

  it('asks nothing and says off while Copilot is switched off; switching on starts asking, switching off aborts the one in flight', async () => {
    const { api, calls, signals } = fakeApi([async () => ({ ok: true, value: state() })]);
    const { result, rerender } = renderHook(({ on }) => useServerStatus(api, 1000, on), { initialProps: { on: false } });
    await flush();
    await act(async () => void jest.advanceTimersByTime(5000));
    expect(calls()).toBe(0);
    expect(result.current).toBe('off');

    rerender({ on: true });
    expect(result.current).toBe('checking');
    await flush();
    expect(calls()).toBe(1);
    expect(result.current).toBe('online');

    rerender({ on: false });
    expect(signals[0].aborted).toBe(true);
    expect(result.current).toBe('off');
    await act(async () => void jest.advanceTimersByTime(5000));
    expect(calls()).toBe(1);
  });

  it('hands every successful answer to the callback, the newest one given, and nothing for a failure', async () => {
    const { api } = fakeApi([async () => ({ ok: true, value: state({ stale: true }) }), async () => ({ ok: false, reason: 'offline' }), async () => ({ ok: true, value: state() })]);
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useServerStatus(api, 1000, true, cb), { initialProps: { cb: first } });
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0][0]).toMatchObject({ stale: true });

    rerender({ cb: second }); // changing the callback does not restart the polling
    await act(async () => void jest.advanceTimersByTime(1000));
    await flush();
    expect(second).not.toHaveBeenCalled(); // the second answer was a failure
    await act(async () => void jest.advanceTimersByTime(1000));
    await flush();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('after being switched off and on again it starts from checking, not from the answer it had before', async () => {
    const { api } = fakeApi([async () => ({ ok: true, value: state() })]);
    const { result, rerender } = renderHook(({ on }) => useServerStatus(api, 1000, on), { initialProps: { on: true } });
    await flush();
    expect(result.current).toBe('online');
    rerender({ on: false });
    rerender({ on: true });
    expect(result.current).toBe('checking');
    await flush();
    expect(result.current).toBe('online');
  });

  it('polls again after the interval and follows the server back online', async () => {
    const { api, calls } = fakeApi([async () => ({ ok: false, reason: 'offline' }), async () => ({ ok: true, value: state() })]);
    const { result } = renderHook(() => useServerStatus(api, 1000));
    await flush();
    expect(result.current).toBe('offline');
    await act(async () => void jest.advanceTimersByTime(1000));
    await flush();
    expect(calls()).toBe(2);
    expect(result.current).toBe('online');
  });

  it('on unmount aborts the poll in flight and starts no more', async () => {
    let release!: (r: ApiResult<ServerState>) => void;
    const { api, signals, calls } = fakeApi([() => new Promise((resolve) => (release = resolve))]);
    const { result, unmount } = renderHook(() => useServerStatus(api, 1000));
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[0].aborted).toBe(true);
    await act(async () => release({ ok: true, value: state() }));
    await act(async () => void jest.advanceTimersByTime(5000));
    expect(calls()).toBe(1);
    expect(result.current).toBe('checking'); // the late answer was ignored
  });

  it('clears a scheduled poll on unmount', async () => {
    const { api, calls } = fakeApi([async () => ({ ok: true, value: state() })]);
    const { unmount } = renderHook(() => useServerStatus(api, 1000));
    await flush();
    unmount();
    await act(async () => void jest.advanceTimersByTime(5000));
    expect(calls()).toBe(1);
  });

  it('uses a 3 second interval by default', async () => {
    const { api, calls } = fakeApi([async () => ({ ok: true, value: state() })]);
    renderHook(() => useServerStatus(api));
    await flush();
    await act(async () => void jest.advanceTimersByTime(2999));
    expect(calls()).toBe(1);
    await act(async () => void jest.advanceTimersByTime(1));
    await flush();
    expect(calls()).toBe(2);
  });
});
