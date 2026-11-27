import { act, renderHook } from '@testing-library/react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import { useGameCommand } from './useGameCommand';

function listen() {
  const typed: number[] = [];
  const stop = ListenEvent<{ at: number }>('shatteredarchive:user-typing', (p) => typed.push(p.at), { key: 'usertyping-test' });
  return { typed, stop };
}

describe('useGameCommand tells the rest of the client when the user types', () => {
  it('emits user-typing with a time each time the input text changes to something', () => {
    const heard = listen();
    const { result } = renderHook(() => useGameCommand({ sendRaw: () => undefined, isConnected: true }));
    expect(heard.typed).toEqual([]); // an empty box is not typing

    const before = Date.now();
    act(() => result.current.setInputValue('n'));
    act(() => result.current.setInputValue('no'));
    expect(heard.typed).toHaveLength(2);
    expect(heard.typed[0]).toBeGreaterThanOrEqual(before);
    heard.stop();
  });

  it('is silent when the box is cleared', () => {
    const heard = listen();
    const { result } = renderHook(() => useGameCommand({ sendRaw: () => undefined, isConnected: true }));
    act(() => result.current.setInputValue('look'));
    act(() => result.current.setInputValue(''));
    expect(heard.typed).toHaveLength(1);
    heard.stop();
  });
});
