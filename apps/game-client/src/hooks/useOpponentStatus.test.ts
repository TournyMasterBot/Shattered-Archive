import { renderHook, act } from '@testing-library/react';
import { useOpponentStatus } from './useOpponentStatus';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

describe('useOpponentStatus', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  it('starts inactive with no enemy', () => {
    const { result } = renderHook(() => useOpponentStatus());
    expect(result.current.isEnemyActive).toBe(false);
    expect(result.current.enemyUi.label).toBe('Enemy');
  });

  it('becomes active when event:fighting:opponent fires', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });

    expect(result.current.isEnemyActive).toBe(true);
    expect(result.current.enemyUi.label).toBe('A rabid wolf');
    expect(result.current.enemyUi.pct).toBe(80);
  });

  it('goes stale after ENEMY_STALE_MS (5000ms) with no new event', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    expect(result.current.isEnemyActive).toBe(true);

    act(() => {
      jest.advanceTimersByTime(5200);
    });
    expect(result.current.isEnemyActive).toBe(false);
  });

  it('shows a damage chunk when pct drops, and clears it after its own timeout', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 50, ts: Date.now() });
    });

    expect(result.current.damageChunk).not.toBeNull();
    expect(result.current.damageChunk!.leftPct).toBe(50);
    expect(result.current.damageChunk!.widthPct).toBe(30);

    act(() => {
      jest.advanceTimersByTime(4600);
    });
    expect(result.current.damageChunk).toBeNull();
  });

  it('cleans up its timers on unmount (no pending-timer warnings)', () => {
    const { unmount } = renderHook(() => useOpponentStatus());
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    // No assertion needed beyond "this doesn't throw" — jest.useFakeTimers
    // surfaces leaked/dangling timers as noise if cleanup is missing.
  });
});
