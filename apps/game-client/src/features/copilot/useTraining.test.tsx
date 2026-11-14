import { act, renderHook } from '@testing-library/react';
import type { ApiResult, CopilotApi, TrainingStatus } from './api';
import { useTraining } from './useTraining';

const status = (over: Partial<TrainingStatus> = {}): TrainingStatus => ({ enabled: false, world: 'sandbox', canEnable: true, ...over });

function fakeApi(answers: ApiResult<TrainingStatus>[], setAnswer: ApiResult<TrainingStatus> = { ok: true, value: status({ enabled: true }) }) {
  let n = 0;
  const signals: AbortSignal[] = [];
  const sets: boolean[] = [];
  const api = {
    getTraining: async (signal: AbortSignal) => {
      signals.push(signal);
      return answers[Math.min(n++, answers.length - 1)];
    },
    setTraining: async (on: boolean) => {
      sets.push(on);
      return setAnswer;
    },
  } as unknown as CopilotApi;
  return { api, signals, sets, polls: () => n };
}
const flush = () => act(async () => void (await Promise.resolve()));

describe('useTraining', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is unknown until the server answers, then shows what the server says, and polls again', async () => {
    const t = fakeApi([{ ok: true, value: status() }, { ok: true, value: status({ world: 'dsl', canEnable: false, refusal: 'not-simulacrum' }) }]);
    const { result } = renderHook(() => useTraining(t.api, true, 1000));
    expect(result.current.status).toBeUndefined();
    await flush();
    expect(result.current.status).toEqual(status());
    await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
    expect(result.current.status).toEqual(status({ world: 'dsl', canEnable: false, refusal: 'not-simulacrum' }));
  });

  it('polls every three seconds unless told otherwise', async () => {
    const t = fakeApi([{ ok: true, value: status() }]);
    renderHook(() => useTraining(t.api, true));
    await flush();
    await act(async () => void (await jest.advanceTimersByTimeAsync(2999)));
    expect(t.polls()).toBe(1);
    await act(async () => void (await jest.advanceTimersByTimeAsync(1)));
    expect(t.polls()).toBe(2);
  });

  it('leaves the status unknown when the server cannot be reached, and recovers', async () => {
    const t = fakeApi([{ ok: false, reason: 'offline' }, { ok: true, value: status() }]);
    const { result } = renderHook(() => useTraining(t.api, true, 1000));
    await flush();
    expect(result.current.status).toBeUndefined();
    await act(async () => void (await jest.advanceTimersByTimeAsync(1000)));
    expect(result.current.status).toEqual(status());
  });

  it('requests nothing while Copilot is off, and forgets the status when it is switched off', async () => {
    const t = fakeApi([{ ok: true, value: status() }]);
    const { result, rerender } = renderHook(({ on }) => useTraining(t.api, on, 1000), { initialProps: { on: false } });
    await flush();
    expect(t.polls()).toBe(0);
    rerender({ on: true });
    await flush();
    expect(result.current.status).toBeDefined();
    rerender({ on: false });
    expect(result.current.status).toBeUndefined();
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(t.polls()).toBe(1);
    await act(async () => result.current.set(true)); // nothing to refresh while off: it just asks the server
  });

  it('turns training on through the server and reads the status again, whatever the server answered', async () => {
    const t = fakeApi([{ ok: true, value: status() }, { ok: true, value: status({ enabled: true }) }]);
    const { result } = renderHook(() => useTraining(t.api, true, 60_000));
    await flush();
    await act(async () => result.current.set(true));
    expect(t.sets).toEqual([true]);
    expect(result.current.status?.enabled).toBe(true);
  });

  it('shows the refusal as the status the server then has (the connection is not the Simulacrum\'s)', async () => {
    const t = fakeApi([{ ok: true, value: status() }, { ok: true, value: status({ world: 'dsl', canEnable: false, refusal: 'not-simulacrum' }) }], { ok: false, reason: 'http', status: 409 });
    const { result } = renderHook(() => useTraining(t.api, true, 60_000));
    await flush();
    await act(async () => result.current.set(true));
    expect(result.current.status).toMatchObject({ enabled: false, canEnable: false, refusal: 'not-simulacrum' });
  });

  it('stops polling and aborts the poll in flight on unmount', async () => {
    const t = fakeApi([{ ok: true, value: status() }]);
    const { unmount } = renderHook(() => useTraining(t.api, true, 1000));
    await flush();
    unmount();
    expect(t.signals[0].aborted).toBe(true);
    await act(async () => void (await jest.advanceTimersByTimeAsync(5000)));
    expect(t.polls()).toBe(1);
  });

  it('ignores an answer that arrives after the hook was switched off', async () => {
    let release: (value: ApiResult<TrainingStatus>) => void = () => undefined;
    const api = {
      getTraining: () => new Promise<ApiResult<TrainingStatus>>((resolve) => (release = resolve)),
      setTraining: async () => ({ ok: true, value: status() }) as ApiResult<TrainingStatus>,
    } as unknown as CopilotApi;
    const { result, rerender } = renderHook(({ on }) => useTraining(api, on, 1000), { initialProps: { on: true } });
    rerender({ on: false });
    await act(async () => release({ ok: true, value: status({ enabled: true }) }));
    expect(result.current.status).toBeUndefined();
  });
});
