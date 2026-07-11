import { renderHook, act, waitFor } from '@testing-library/react';

import { useSimBatch } from './useSimBatch';
import type { SimConfig } from '../sim-runner';

const config = (matches: number): SimConfig => ({
  modeId: 'skirmish',
  policyBySide: { 0: 'greedy', 1: 'greedy' },
  matches,
  baseSeed: 1,
});

describe('useSimBatch', () => {
  it('runs a batch to completion, exposing progress then result', async () => {
    const { result } = renderHook(() => useSimBatch());
    expect(result.current.running).toBe(false);
    expect(result.current.result).toBeNull();

    act(() => result.current.run(config(8)));

    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.result).not.toBeNull();
    expect(result.current.result!.matches).toBe(8);
    expect(result.current.progress).toBe(8);
  });

  it('ignores a second run while one is already in flight', async () => {
    const { result } = renderHook(() => useSimBatch());
    act(() => {
      result.current.run(config(8));
      result.current.run(config(2)); // ignored — first is still running
    });
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.result!.matches).toBe(8);
  });
});
