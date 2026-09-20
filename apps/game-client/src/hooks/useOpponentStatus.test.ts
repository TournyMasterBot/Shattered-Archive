import { renderHook, act } from '@testing-library/react';
import { useOpponentStatus } from './useOpponentStatus';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests, getEnemyUiSnapshot } from '../features/combat/opponentStatusStore';

describe('useOpponentStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    __resetForTests();
  });
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

  it('writes every update to opponentStatusStore, for a later remount to seed from', () => {
    renderHook(() => useOpponentStatus());
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });

    expect(getEnemyUiSnapshot()?.label).toBe('A rabid wolf');
    expect(getEnemyUiSnapshot()?.pct).toBe(80);
  });

  it('a fresh mount (simulating a live theme switch) seeds from the store instead of starting blank', () => {
    const first = renderHook(() => useOpponentStatus());
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    first.unmount();

    // A theme switch remounts the component tree, but time barely passes —
    // still well inside ENEMY_STALE_MS, so the fresh instance should read
    // as active immediately, not reset to the "Enemy 0%" default.
    const second = renderHook(() => useOpponentStatus());
    expect(second.result.current.enemyUi.label).toBe('A rabid wolf');
    expect(second.result.current.enemyUi.pct).toBe(80);
    expect(second.result.current.isEnemyActive).toBe(true);
  });

  it('a fresh mount after the staleness window has passed seeds inactive, not a stale "active" bar', () => {
    const first = renderHook(() => useOpponentStatus());
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    first.unmount();

    act(() => {
      jest.advanceTimersByTime(5200);
    });

    const second = renderHook(() => useOpponentStatus());
    expect(second.result.current.isEnemyActive).toBe(false);
  });
});
