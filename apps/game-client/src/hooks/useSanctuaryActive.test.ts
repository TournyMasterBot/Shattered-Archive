import { renderHook, act } from '@testing-library/react';
import { useSanctuaryActive } from './useSanctuaryActive';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests, setAffects } from '../features/affects/affectsStore';

const SANCTUARY = { n: 'sanctuary', d: 20, lc: 'spell', m: 0, t: 0 };
const HASTE = { n: 'haste', d: 10, lc: 'spell', m: 0, t: 0 };

describe('useSanctuaryActive', () => {
  beforeEach(() => __resetForTests());

  it('starts false with no affects data yet', () => {
    const { result } = renderHook(() => useSanctuaryActive());
    expect(result.current.hasSanctuary).toBe(false);
  });

  it('becomes true on a trueup snapshot containing sanctuary', () => {
    const { result } = renderHook(() => useSanctuaryActive());

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY] });
    });

    expect(result.current.hasSanctuary).toBe(true);
  });

  it('a fresh mount seeds true from the shared affectsStore cache (that useAffectsBlock writes) instead of starting false', () => {
    // Sanctuary presence isn't re-derived from a raw game:affects-trueup
    // payload at seed time — it's read from the SAME shared affectsStore
    // cache useAffectsBlock's trueup handler writes to. So seed the store
    // directly here to prove the cross-hook contract, not this hook
    // reacting to its own event in isolation.
    setAffects([SANCTUARY]);

    const { result } = renderHook(() => useSanctuaryActive());
    expect(result.current.hasSanctuary).toBe(true);
  });

  it('a fresh mount seeds false when the cache has no sanctuary entry', () => {
    setAffects([HASTE]);

    const { result } = renderHook(() => useSanctuaryActive());
    expect(result.current.hasSanctuary).toBe(false);
  });
});
