import { renderHook } from '@testing-library/react';

import { useBeforeUnloadGuard } from './useBeforeUnloadGuard';

// The guard keeps ONE beforeunload listener for the life of the component and reads the latest `active` from a ref, so there
// is never a moment where the guard is detached while a connection is up. `active` reaches the ref in a layout effect.

function leavePage(): BeforeUnloadEvent {
  const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(ev);
  return ev;
}

describe('useBeforeUnloadGuard', () => {
  it('asks the browser to confirm leaving while active', () => {
    renderHook(() => useBeforeUnloadGuard(true));

    expect(leavePage().defaultPrevented).toBe(true);
  });

  it('lets the page close without a prompt while inactive', () => {
    renderHook(() => useBeforeUnloadGuard(false));

    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('follows the latest `active` value across renders', () => {
    const { rerender } = renderHook(({ active }) => useBeforeUnloadGuard(active), { initialProps: { active: false } });
    expect(leavePage().defaultPrevented).toBe(false);

    rerender({ active: true });
    expect(leavePage().defaultPrevented).toBe(true);

    rerender({ active: false });
    expect(leavePage().defaultPrevented).toBe(false);
  });

  it('attaches the listener once, however many times `active` changes', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(({ active }) => useBeforeUnloadGuard(active), { initialProps: { active: false } });
    rerender({ active: true });
    rerender({ active: false });

    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1);
    add.mockRestore();
  });

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useBeforeUnloadGuard(true));

    unmount();

    expect(leavePage().defaultPrevented).toBe(false);
  });
});
