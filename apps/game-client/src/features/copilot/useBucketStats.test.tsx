import { act, renderHook, waitFor } from '@testing-library/react';
import type { BucketTable } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi } from './api';
import { useBucketStats, type BucketStatsView } from './useBucketStats';

function fakeApi(answers: ApiResult<BucketTable>[]) {
  let calls = 0;
  const signals: AbortSignal[] = [];
  const api = {
    getBucketStats: async (signal: AbortSignal) => {
      signals.push(signal);
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return answer;
    },
  } as unknown as CopilotApi;
  return { api, calls: () => calls, signals };
}

const table: BucketTable = { 'world:move': { approved: 3, total: 4 } };

describe('useBucketStats', () => {
  it('is empty and unknown until the first answer, then holds the table', async () => {
    const { api } = fakeApi([{ ok: true, value: table }]);
    const { result } = renderHook(() => useBucketStats(api, 20));
    expect(result.current).toEqual({ table: {}, stale: null });
    await waitFor(() => expect(result.current).toEqual({ table, stale: false }));
  });

  it('keeps the last good table and marks it stale when a later poll fails, and recovers', async () => {
    const { api } = fakeApi([{ ok: true, value: table }, { ok: false, reason: 'offline' }, { ok: true, value: {} }]);
    const seen: BucketStatsView[] = [];
    const { result } = renderHook(() => {
      const view = useBucketStats(api, 15);
      seen.push(view);
      return view;
    });
    await waitFor(() => expect(result.current).toEqual({ table: {}, stale: false })); // the third answer, after the failure
    expect(seen).toContainEqual({ table, stale: false });
    expect(seen).toContainEqual({ table, stale: true }); // the failed poll kept the last good table
  });

  it('marks an unreachable server stale from the first answer, with an empty table', async () => {
    const { api } = fakeApi([{ ok: false, reason: 'http', status: 503 }]);
    const { result } = renderHook(() => useBucketStats(api, 20));
    await waitFor(() => expect(result.current).toEqual({ table: {}, stale: true }));
  });

  it('polls again only after the previous answer, and stops (and aborts) on unmount', async () => {
    const { api, calls, signals } = fakeApi([{ ok: true, value: table }]);
    const { unmount } = renderHook(() => useBucketStats(api, 15));
    await waitFor(() => expect(calls()).toBeGreaterThanOrEqual(2));
    unmount();
    const atUnmount = calls();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 80))));
    expect(calls()).toBeLessThanOrEqual(atUnmount + 1); // at most the one already in flight
    expect(signals.every((s) => s.aborted || s === signals[signals.length - 1])).toBe(true);
    expect(signals[signals.length - 1].aborted).toBe(true);
  });

  it('ignores an answer that arrives after unmount', async () => {
    let release: (value: ApiResult<BucketTable>) => void = () => undefined;
    const api = { getBucketStats: () => new Promise<ApiResult<BucketTable>>((resolve) => (release = resolve)) } as unknown as CopilotApi;
    const { result, unmount } = renderHook(() => useBucketStats(api, 20));
    unmount();
    await act(async () => release({ ok: true, value: table }));
    expect(result.current).toEqual({ table: {}, stale: null });
  });
});
