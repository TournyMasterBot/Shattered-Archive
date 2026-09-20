import { renderHook, act } from '@testing-library/react';
import { useRoomHeader } from './useRoomHeader';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests } from '../features/room/roomDataStore';

describe('useRoomHeader', () => {
  beforeEach(() => __resetForTests());

  it('starts blank with no room data yet', () => {
    const { result } = renderHook(() => useRoomHeader());
    expect(result.current.roomName).toBe('');
    expect(result.current.roomFlags).toBe('');
  });

  it('updates on game:room-data', () => {
    const { result } = renderHook(() => useRoomHeader());

    act(() => {
      DispatchEvent('game:room-data', { room: 'The Crystal Heart', sector: 'inside', exits: ['N'] });
    });

    expect(result.current.roomName).toBe('The Crystal Heart');
    expect(result.current.sector).toBe('inside');
    expect(result.current.roomFlags).toBe('(inside)');
  });

  it('a fresh mount (simulating a live theme switch) seeds from roomDataStore instead of starting blank', () => {
    const first = renderHook(() => useRoomHeader());
    act(() => {
      DispatchEvent('game:room-data', { room: 'The Crystal Heart', sector: 'inside', exits: ['N'] });
    });
    first.unmount();

    const second = renderHook(() => useRoomHeader());
    expect(second.result.current.roomName).toBe('The Crystal Heart');
    expect(second.result.current.roomFlags).toBe('(inside)');
  });
});
