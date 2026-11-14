import { act, fireEvent, render, renderHook } from '@testing-library/react';
import React from 'react';
import { WINDOW_BASE_Z, openWindowCount, useWindowLayer } from './useWindowLayer';

const escape = (target: Element = document.body) => fireEvent.keyDown(target, { key: 'Escape' });

describe('useWindowLayer: the order windows are drawn in', () => {
  it('draws a window that opens above every window opened before it', () => {
    const first = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    const second = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    expect(first.result.current.zIndex).toBe(WINDOW_BASE_Z);
    expect(second.result.current.zIndex).toBe(WINDOW_BASE_Z + 1);
    first.unmount();
    second.unmount();
  });

  it('bringToFront puts a dragged window on top, and then the other one again when that is dragged', () => {
    const copilot = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    const autopilot = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    expect(autopilot.result.current.zIndex).toBeGreaterThan(copilot.result.current.zIndex);

    act(() => copilot.result.current.bringToFront());
    expect(copilot.result.current.zIndex).toBeGreaterThan(autopilot.result.current.zIndex);

    act(() => autopilot.result.current.bringToFront());
    expect(autopilot.result.current.zIndex).toBeGreaterThan(copilot.result.current.zIndex);

    // already on top: nothing changes
    const before = autopilot.result.current.zIndex;
    act(() => autopilot.result.current.bringToFront());
    expect(autopilot.result.current.zIndex).toBe(before);
    copilot.unmount();
    autopilot.unmount();
  });

  it('keeps the z-indexes dense: closing a window lets the others come down, and the numbers never grow with the number of drags', () => {
    const a = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    const b = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    for (let i = 0; i < 50; i++) {
      act(() => a.result.current.bringToFront());
      act(() => b.result.current.bringToFront());
    }
    expect(Math.max(a.result.current.zIndex, b.result.current.zIndex)).toBe(WINDOW_BASE_Z + 1);
    b.unmount();
    expect(a.result.current.zIndex).toBe(WINDOW_BASE_Z);
    a.unmount();
  });

  it('registers nothing while closed, and a window that opens later goes on top', () => {
    const always = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    const later = renderHook(({ open }) => useWindowLayer({ open, onEscape: () => undefined }), { initialProps: { open: false } });
    expect(openWindowCount()).toBe(1);
    later.rerender({ open: true });
    expect(openWindowCount()).toBe(2);
    expect(later.result.current.zIndex).toBeGreaterThan(always.result.current.zIndex);
    later.rerender({ open: false });
    expect(openWindowCount()).toBe(1);
    always.unmount();
    expect(openWindowCount()).toBe(0);
  });

  it('ignores a bringToFront from a window that is not open', () => {
    const open = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    const closed = renderHook(() => useWindowLayer({ open: false, onEscape: () => undefined }));
    act(() => closed.result.current.bringToFront());
    expect(openWindowCount()).toBe(1);
    expect(open.result.current.zIndex).toBe(WINDOW_BASE_Z);
    open.unmount();
  });
});

describe('useWindowLayer: the Escape key', () => {
  it('closes the top-most window only, one window per press, anywhere on the page', () => {
    const closed: string[] = [];
    const a = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('a') }));
    const b = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('b') }));
    escape();
    expect(closed).toEqual(['b']);
    b.unmount(); // the host closed it
    escape();
    expect(closed).toEqual(['b', 'a']);
    a.unmount();
  });

  it('closes the window that was dragged to the front first, not the one opened last', () => {
    const closed: string[] = [];
    const a = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('a') }));
    const b = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('b') }));
    act(() => a.result.current.bringToFront());
    escape();
    expect(closed).toEqual(['a']);
    a.unmount();
    b.unmount();
  });

  it('calls the handler of the latest render without moving the window in the stack', () => {
    const calls: number[] = [];
    const a = renderHook(({ n }) => useWindowLayer({ open: true, onEscape: () => calls.push(n) }), { initialProps: { n: 1 } });
    const b = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    a.rerender({ n: 2 });
    expect(a.result.current.zIndex).toBeLessThan(b.result.current.zIndex);
    b.unmount();
    escape();
    expect(calls).toEqual([2]);
    a.unmount();
  });

  it('leaves a key that something inside already used (preventDefault, or stopPropagation as an open dropdown does)', () => {
    const closed: string[] = [];
    const win = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('window') }));
    const Inner: React.FC = () => (
      <div>
        <input aria-label="dropdown" onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()} />
        <input aria-label="prevented" onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()} />
        <input aria-label="plain" />
      </div>
    );
    const { getByLabelText } = render(<Inner />);
    escape(getByLabelText('dropdown'));
    escape(getByLabelText('prevented'));
    expect(closed).toEqual([]);
    escape(getByLabelText('plain'));
    expect(closed).toEqual(['window']);
    win.unmount();
  });

  it('ignores other keys, an Escape that ends an IME composition, and an Escape with no window open', () => {
    const closed: string[] = [];
    const win = renderHook(() => useWindowLayer({ open: true, onEscape: () => closed.push('window') }));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });
    expect(closed).toEqual([]);
    win.unmount();
    const notPrevented = fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(notPrevented).toBe(true); // nothing was open: the key is left alone for whatever else wants it
    expect(closed).toEqual([]);
  });

  it('marks the key as used when a window takes it, so no other listener acts on it too', () => {
    const win = renderHook(() => useWindowLayer({ open: true, onEscape: () => undefined }));
    expect(escape()).toBe(false); // fireEvent returns false when preventDefault was called
    win.unmount();
  });
});
