import { renderHook, act } from '@testing-library/react';
import { useAffectsBlock } from './useAffectsBlock';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests } from '../features/affects/affectsStore';

const SANCTUARY = { n: 'sanctuary', d: 20, lc: 'spell' };

describe('useAffectsBlock', () => {
  beforeEach(() => __resetForTests());

  it('starts empty with no affects data yet', () => {
    const { result } = renderHook(() => useAffectsBlock());
    expect(result.current.affects).toEqual([]);
  });

  it('populates from a game:affects-trueup snapshot', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY] });
    });

    expect(result.current.affects).toHaveLength(1);
    expect(result.current.affects[0].n).toBe('sanctuary');
  });

  it('a fresh mount (simulating a live theme switch) seeds from affectsStore instead of starting empty', () => {
    const first = renderHook(() => useAffectsBlock());
    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY] });
    });
    first.unmount();

    const second = renderHook(() => useAffectsBlock());
    expect(second.result.current.affects).toHaveLength(1);
    expect(second.result.current.affects[0].n).toBe('sanctuary');
  });
});
