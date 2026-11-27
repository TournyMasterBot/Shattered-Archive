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

  // The staleness clock used to tick every 200 ms for as long as the hook was mounted, so every HUD that shows the
  // enemy bar re-rendered five times a second while nothing was fighting. It now only runs while an enemy is active.
  describe('staleness clock', () => {
    function renderCounted() {
      const counter = { renders: 0 };
      const hook = renderHook(() => {
        counter.renders++;
        return useOpponentStatus();
      });
      return { counter, ...hook };
    }

    it('does not re-render while no enemy has been seen', () => {
      const { counter } = renderCounted();
      // One render for the mount itself: the effect must not set state when there is no enemy to time.
      expect(counter.renders).toBe(1);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(counter.renders).toBe(1);
    });

    it('keeps ticking while the enemy is active, then stops once it goes stale', () => {
      const { counter, result } = renderCounted();
      act(() => {
        DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
      });

      const beforeTicks = counter.renders;
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(counter.renders).toBeGreaterThan(beforeTicks);
      expect(result.current.isEnemyActive).toBe(true);

      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.isEnemyActive).toBe(false);

      const afterStale = counter.renders;
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(counter.renders).toBe(afterStale);
    });

    it('starts ticking again when a new enemy line arrives after going stale', () => {
      const { result } = renderCounted();
      act(() => {
        DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
      });
      act(() => {
        jest.advanceTimersByTime(6000);
      });
      expect(result.current.isEnemyActive).toBe(false);

      act(() => {
        DispatchEvent('event:fighting:opponent', { label: 'A bear', pct: 60, ts: Date.now() });
      });
      expect(result.current.isEnemyActive).toBe(true);

      act(() => {
        jest.advanceTimersByTime(5200);
      });
      expect(result.current.isEnemyActive).toBe(false);
    });

    it('treats an enemy line stamped more than 5s ago as already stale, even after a long idle', () => {
      const { result } = renderCounted();
      act(() => {
        jest.advanceTimersByTime(60000);
      });

      act(() => {
        DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() - 8000 });
      });

      expect(result.current.isEnemyActive).toBe(false);
    });
  });

  describe('opponent line handling', () => {
    const fight = (detail: Record<string, unknown>) => act(() => void DispatchEvent('event:fighting:opponent', detail));

    it('ignores an event with no usable pct', () => {
      const { result } = renderHook(() => useOpponentStatus());

      fight({ label: 'A rabid wolf', pct: Number.NaN, ts: Date.now() });
      fight({ label: 'A rabid wolf', ts: Date.now() });
      act(() => void DispatchEvent('event:fighting:opponent', undefined as never));

      expect(result.current.isEnemyActive).toBe(false);
      expect(result.current.enemyUi.label).toBe('Enemy');
      expect(getEnemyUiSnapshot()).toBeNull();
    });

    it('stamps the line with the current time when the event carries no ts', () => {
      const { result } = renderHook(() => useOpponentStatus());
      const before = Date.now();

      fight({ label: 'A rabid wolf', pct: 80 });

      expect(result.current.enemyUi.lastSeenTs).toBeGreaterThanOrEqual(before);
      expect(result.current.isEnemyActive).toBe(true);
    });

    it('keeps the previous label when a line has a blank one, and falls back to "Enemy" when there is none', () => {
      const { result } = renderHook(() => useOpponentStatus());

      fight({ label: '   ', pct: 90, ts: Date.now() });
      expect(result.current.enemyUi.label).toBe('Enemy');

      fight({ label: '  A rabid wolf  ', pct: 80, ts: Date.now() });
      expect(result.current.enemyUi.label).toBe('A rabid wolf');

      fight({ pct: 70, ts: Date.now() });
      expect(result.current.enemyUi.label).toBe('A rabid wolf');
    });

    it('keys the damage chunk by the event ts, or by the current time without one, and restarts its timeout', () => {
      const { result } = renderHook(() => useOpponentStatus());
      fight({ label: 'A rabid wolf', pct: 90, ts: 1000 + Date.now() });
      fight({ label: 'A rabid wolf', pct: 70, ts: 5000 + Date.now() });
      expect(result.current.damageChunk?.key).toBeGreaterThan(5000);

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      fight({ label: 'A rabid wolf', pct: 40 });
      expect(result.current.damageChunk).toMatchObject({ leftPct: 40, widthPct: 30 });
      const keyWithoutTs = result.current.damageChunk!.key;
      expect(keyWithoutTs).toBeLessThanOrEqual(Date.now());

      // The first chunk's 4500 ms timer was replaced, so it must not clear the newer chunk early.
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.damageChunk).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(2600);
      });
      expect(result.current.damageChunk).toBeNull();
    });

    it('does not show a chunk for a drop too small to see', () => {
      const { result } = renderHook(() => useOpponentStatus());

      fight({ label: 'A rabid wolf', pct: 80, ts: Date.now() });
      fight({ label: 'A rabid wolf', pct: 79.98, ts: Date.now() });

      expect(result.current.damageChunk).toBeNull();
    });

    it('drops the damage chunk at once when the line that caused it is already stale', () => {
      const { result } = renderHook(() => useOpponentStatus());

      fight({ label: 'A rabid wolf', pct: 80, ts: Date.now() });
      fight({ label: 'A rabid wolf', pct: 50, ts: Date.now() - 8000 });

      expect(result.current.isEnemyActive).toBe(false);
      expect(result.current.damageChunk).toBeNull();
    });

    it('unmounts cleanly even if disposing its listener throws', () => {
      const dispatcher = jest.requireActual('../features/event-emitter/event-dispatcher');
      const spy = jest.spyOn(dispatcher, 'ListenEvent').mockImplementation(() => () => {
        throw new Error('already disposed');
      });
      try {
        const { unmount } = renderHook(() => useOpponentStatus());
        expect(() => unmount()).not.toThrow();
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
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
