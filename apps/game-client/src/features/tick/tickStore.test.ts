import { renderHook, act } from '@testing-library/react';
import { useTickData } from './tickStore';
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';

const STORE_KEY = '__shatteredarchive_tick_store__';

describe('tickStore tick warning', () => {
  beforeEach(() => {
    // The store is a globalThis-cached singleton (HMR-safe by design) — drop
    // it between tests so each test starts with a fresh countdown/interval.
    delete (globalThis as any)[STORE_KEY];
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires exactly one red write-terminal warning when the countdown crosses 5 seconds', () => {
    const writes: any[] = [];
    const dispose = ListenEvent<any>(
      'shatteredarchive:write-terminal',
      (payload) => writes.push(payload),
      { key: 'tickStore.test::write-terminal-listener' },
    );

    renderHook(() => useTickData(10));

    act(() => {
      DispatchEvent('game:remote-server:open', {});
      DispatchEvent('game:tick', { time: '6:00pm' });
    });

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].rawText).toContain('Tick in 5 seconds!');
    expect(writes[0].rawText).toContain('[91m');
    expect(writes[0].rawText).toContain('[0m');
    expect(writes[0].fromUserScript).toBe(true);

    dispose();
  });

  it('does not fire again while remaining stays at 5 across multiple polls', () => {
    const writes: any[] = [];
    const dispose = ListenEvent<any>(
      'shatteredarchive:write-terminal',
      (payload) => writes.push(payload),
      { key: 'tickStore.test::write-terminal-listener-2' },
    );

    renderHook(() => useTickData(10));

    act(() => {
      DispatchEvent('game:remote-server:open', {});
      DispatchEvent('game:tick', { time: '6:00pm' });
    });

    // Advance in small steps that repeatedly land on the same rounded
    // "5 seconds remaining" value before crossing further down.
    act(() => {
      jest.advanceTimersByTime(4750);
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(writes).toHaveLength(1);

    dispose();
  });

  it('does not fire a second time within the same tick cycle after re-crossing due to a fresh tick', () => {
    const writes: any[] = [];
    const dispose = ListenEvent<any>(
      'shatteredarchive:write-terminal',
      (payload) => writes.push(payload),
      { key: 'tickStore.test::write-terminal-listener-3' },
    );

    renderHook(() => useTickData(10));

    act(() => {
      DispatchEvent('game:remote-server:open', {});
      DispatchEvent('game:tick', { time: '6:00pm' });
    });

    act(() => {
      jest.advanceTimersByTime(6000); // crosses 5s once
    });
    expect(writes).toHaveLength(1);

    // A fresh tick resets the countdown back up to durationSec (10) —
    // nowhere near the threshold — so it must not warn again immediately.
    act(() => {
      DispatchEvent('game:tick', { time: '6:00pm' });
    });
    expect(writes).toHaveLength(1);

    // Advancing through the threshold again on this new cycle should warn once more.
    act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(writes).toHaveLength(2);

    dispose();
  });
});
