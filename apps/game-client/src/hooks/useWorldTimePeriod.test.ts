import { renderHook, act } from '@testing-library/react';
import { useWorldTimePeriod } from './useWorldTimePeriod';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

describe('useWorldTimePeriod', () => {
  beforeEach(() => {
    delete (window as any).__SA_WORLD_TIME__;
  });

  it('starts null when there is no snapshot and nothing has been dispatched', () => {
    const { result } = renderHook(() => useWorldTimePeriod());
    expect(result.current.period).toBeNull();
  });

  it('seeds from window.__SA_WORLD_TIME__ at mount, for late subscribers', () => {
    (window as any).__SA_WORLD_TIME__ = { period: 'Dusk', updatedAt: 123 };
    const { result } = renderHook(() => useWorldTimePeriod());
    expect(result.current.period).toBe('Dusk');
  });

  it('updates when shatteredarchive:world-time-updated fires after mount', () => {
    const { result } = renderHook(() => useWorldTimePeriod());
    expect(result.current.period).toBeNull();

    act(() => {
      DispatchEvent('shatteredarchive:world-time-updated', { period: 'Night Time', updatedAt: 456 });
    });

    expect(result.current.period).toBe('Night Time');
  });

  it('unsubscribes on unmount (no state update after unmount)', () => {
    const { result, unmount } = renderHook(() => useWorldTimePeriod());
    unmount();

    act(() => {
      DispatchEvent('shatteredarchive:world-time-updated', { period: 'Dawn', updatedAt: 789 });
    });

    expect(result.current.period).toBeNull();
  });

  it('supports multiple simultaneous instances without stomping each other', () => {
    const { result: result1 } = renderHook(() => useWorldTimePeriod());
    const { result: result2 } = renderHook(() => useWorldTimePeriod());

    act(() => {
      DispatchEvent('shatteredarchive:world-time-updated', { period: 'Day Time', updatedAt: 999 });
    });

    expect(result1.current.period).toBe('Day Time');
    expect(result2.current.period).toBe('Day Time');
  });
});
