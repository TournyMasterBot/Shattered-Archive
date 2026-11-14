import { act, renderHook } from '@testing-library/react';
import { useConfirmation } from './useConfirmation';

const request = { command: 'freeze', line: 'freeze Testchar', scope: 'at stake' };

describe('useConfirmation', () => {
  it('has no question open at first', () => {
    const { result } = renderHook(() => useConfirmation());
    expect(result.current.pending).toBeUndefined();
  });

  it('opens a question and resolves true when it is answered yes, then closes it', async () => {
    const { result } = renderHook(() => useConfirmation());
    let answer: Promise<boolean> = Promise.resolve(false);
    act(() => {
      answer = result.current.confirm(request);
    });
    expect(result.current.pending).toEqual(request);
    act(() => result.current.answer(true));
    await expect(answer).resolves.toBe(true);
    expect(result.current.pending).toBeUndefined();
  });

  it('resolves false when it is answered no', async () => {
    const { result } = renderHook(() => useConfirmation());
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = result.current.confirm(request);
    });
    act(() => result.current.answer(false));
    await expect(answer).resolves.toBe(false);
    expect(result.current.pending).toBeUndefined();
  });

  it('ignores an answer when no question is open', () => {
    const { result } = renderHook(() => useConfirmation());
    expect(() => act(() => result.current.answer(true))).not.toThrow();
    expect(result.current.pending).toBeUndefined();
  });

  it('answers an open question "no" when the hook goes away, so nothing is sent behind a closed window', async () => {
    const { result, unmount } = renderHook(() => useConfirmation());
    let answer: Promise<boolean> = Promise.resolve(true);
    act(() => {
      answer = result.current.confirm(request);
    });
    unmount();
    await expect(answer).resolves.toBe(false);
  });

  it('does nothing on unmount when no question is open', () => {
    const { unmount } = renderHook(() => useConfirmation());
    expect(() => unmount()).not.toThrow();
  });

  it('keeps the same confirm and answer functions between renders', () => {
    const { result, rerender } = renderHook(() => useConfirmation());
    const { confirm, answer } = result.current;
    rerender();
    expect(result.current.confirm).toBe(confirm);
    expect(result.current.answer).toBe(answer);
  });
});
