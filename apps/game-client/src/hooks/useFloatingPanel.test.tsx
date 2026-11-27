import { act, fireEvent, renderHook } from '@testing-library/react';
import { clampGeometry, parseGeometry, useFloatingPanel, type FloatingPanelOptions } from './useFloatingPanel';

const VIEW = { width: 1000, height: 700 };
const LIMITS = { minWidth: 320, minHeight: 220 };

class Store {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

function setup(over: Partial<FloatingPanelOptions> = {}, view = VIEW) {
  const storage = new Store();
  const hook = renderHook(() =>
    useFloatingPanel({ storageKey: 'panel', initial: { width: 400, height: 300, x: 100, y: 100 }, limits: LIMITS, storage, viewport: () => view, ...over }),
  );
  return { ...hook, storage };
}

/** jsdom has no PointerEvent: a MouseEvent with the pointer event's name carries the same coordinates. */
const pointer = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', x: number, y: number) =>
  act(() => void document.dispatchEvent(new MouseEvent(type.toLowerCase(), { clientX: x, clientY: y, button: 0, bubbles: true })));
const down = (hookResult: { current: ReturnType<typeof useFloatingPanel> }, which: 'header' | 'resize', x: number, y: number, target?: HTMLElement) =>
  act(() => {
    const handler = which === 'header' ? hookResult.current.onHeaderPointerDown : hookResult.current.onResizePointerDown;
    handler({ clientX: x, clientY: y, button: 0, target: target ?? document.body, preventDefault: () => undefined } as unknown as React.PointerEvent<HTMLElement>);
  });

describe('clampGeometry', () => {
  it('keeps the panel inside the viewport at all four edges', () => {
    const g = { width: 400, height: 300 };
    expect(clampGeometry({ ...g, x: -50, y: 100 }, VIEW, LIMITS)).toMatchObject({ x: 0, y: 100 }); // left
    expect(clampGeometry({ ...g, x: 900, y: 100 }, VIEW, LIMITS)).toMatchObject({ x: 600, y: 100 }); // right
    expect(clampGeometry({ ...g, x: 100, y: -9 }, VIEW, LIMITS)).toMatchObject({ x: 100, y: 0 }); // top
    expect(clampGeometry({ ...g, x: 100, y: 650 }, VIEW, LIMITS)).toMatchObject({ x: 100, y: 400 }); // bottom
  });

  it('enforces the minimum size, and a viewport smaller than the minimum wins', () => {
    expect(clampGeometry({ x: 0, y: 0, width: 10, height: 10 }, VIEW, LIMITS)).toMatchObject({ width: 320, height: 220 });
    expect(clampGeometry({ x: 0, y: 0, width: 400, height: 300 }, { width: 300, height: 200 }, LIMITS)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });

  it('rounds, and replaces a number that is not finite', () => {
    expect(clampGeometry({ x: 10.6, y: 20.4, width: 400.5, height: 300.2 }, VIEW, LIMITS)).toEqual({ x: 11, y: 20, width: 401, height: 300 });
    expect(clampGeometry({ x: Number.NaN, y: Infinity, width: Number.NaN, height: Number.NaN }, VIEW, LIMITS)).toEqual({ x: 0, y: 0, width: 320, height: 220 });
  });
});

describe('parseGeometry', () => {
  it('reads four numbers and nothing else', () => {
    expect(parseGeometry('{"x":1,"y":2,"width":3,"height":4}')).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    for (const bad of [null, '', '{', '[]', '{"x":1}', '{"x":"1","y":2,"width":3,"height":4}', 'null']) {
      expect(parseGeometry(bad)).toBeUndefined();
    }
  });
});

describe('useFloatingPanel', () => {
  it('starts at the given geometry, or top-right when no position is given', () => {
    expect(setup().result.current.geometry).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    expect(setup({ initial: { width: 400, height: 300 } }).result.current.geometry).toEqual({ x: 584, y: 64, width: 400, height: 300 });
    expect(setup({ initial: { width: 400, height: 300, y: 50 } }).result.current.geometry).toEqual({ x: 584, y: 50, width: 400, height: 300 });
    expect(setup({ initial: { width: 400, height: 300, x: 20 } }).result.current.geometry).toEqual({ x: 20, y: 64, width: 400, height: 300 });
  });

  it('drags by the header: the panel follows the pointer and the geometry is saved when the drag ends', () => {
    const { result, storage } = setup();
    down(result, 'header', 150, 120);
    pointer('pointerMove', 250, 170);
    expect(result.current.geometry).toMatchObject({ x: 200, y: 150 });
    expect(storage.data.has('panel')).toBe(false); // saved on release, not on every move
    pointer('pointerUp', 250, 170);
    expect(JSON.parse(storage.data.get('panel') as string)).toEqual({ x: 200, y: 150, width: 400, height: 300 });
    pointer('pointerMove', 400, 400); // no longer following
    expect(result.current.geometry).toMatchObject({ x: 200, y: 150 });
  });

  it('cannot be dragged out of the viewport at any edge', () => {
    const { result } = setup();
    down(result, 'header', 0, 0);
    pointer('pointerMove', -5000, -5000);
    expect(result.current.geometry).toMatchObject({ x: 0, y: 0 });
    pointer('pointerMove', 5000, 5000);
    expect(result.current.geometry).toMatchObject({ x: 600, y: 400 });
    pointer('pointerUp', 5000, 5000);
  });

  it('resizes by the corner, never below the minimum and never past the viewport', () => {
    const { result } = setup();
    down(result, 'resize', 500, 400);
    pointer('pointerMove', 560, 450);
    expect(result.current.geometry).toMatchObject({ x: 100, y: 100, width: 460, height: 350 });
    pointer('pointerMove', -2000, -2000);
    expect(result.current.geometry).toMatchObject({ width: 320, height: 220 });
    pointer('pointerMove', 9000, 9000);
    expect(result.current.geometry).toMatchObject({ x: 100, y: 100, width: 900, height: 600 });
    pointer('pointerUp', 9000, 9000);
  });

  it('a press on a button, select or input in the header does not start a drag; a press on the title does', () => {
    const { result } = setup();
    const button = document.createElement('button');
    down(result, 'header', 150, 120, button);
    pointer('pointerMove', 300, 300);
    expect(result.current.geometry).toMatchObject({ x: 100, y: 100 });
    down(result, 'header', 150, 120, document.createElement('span'));
    pointer('pointerMove', 160, 130);
    expect(result.current.geometry).toMatchObject({ x: 110, y: 110 });
    pointer('pointerUp', 160, 130);
  });

  it('ignores a press that is not the primary button', () => {
    const { result } = setup();
    act(() => {
      result.current.onHeaderPointerDown({ clientX: 0, clientY: 0, button: 2, target: document.body, preventDefault: jest.fn() } as unknown as React.PointerEvent<HTMLElement>);
    });
    pointer('pointerMove', 300, 300);
    expect(result.current.geometry).toMatchObject({ x: 100, y: 100 });
  });

  it('a pointer cancel ends the drag like a release', () => {
    const { result, storage } = setup();
    down(result, 'header', 0, 0);
    pointer('pointerMove', 10, 10);
    act(() => void document.dispatchEvent(new Event('pointercancel')));
    pointer('pointerMove', 300, 300);
    expect(result.current.geometry).toMatchObject({ x: 110, y: 110 });
    expect(storage.data.has('panel')).toBe(true);
  });

  it('restores a saved geometry, clamped when the viewport shrank since', () => {
    const storage = new Store();
    storage.data.set('panel', JSON.stringify({ x: 700, y: 500, width: 500, height: 400 }));
    const options: FloatingPanelOptions = { storageKey: 'panel', initial: { width: 400, height: 300 }, limits: LIMITS, storage, viewport: () => ({ width: 800, height: 600 }) };
    const { result } = renderHook(() => useFloatingPanel(options));
    expect(result.current.geometry).toEqual({ x: 300, y: 200, width: 500, height: 400 });
  });

  it('ignores a saved geometry that is corrupt, and a blocked storage', () => {
    const corrupt = new Store();
    corrupt.data.set('panel', '{"x":"left"}');
    expect(setup({ storage: corrupt }).result.current.geometry).toEqual({ x: 100, y: 100, width: 400, height: 300 });

    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const { result } = setup({ storage: blocked });
    expect(result.current.geometry).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    down(result, 'header', 0, 0);
    pointer('pointerMove', 20, 20);
    pointer('pointerUp', 20, 20); // saving fails quietly
    expect(result.current.geometry).toMatchObject({ x: 120, y: 120 });
  });

  it('is pulled back inside when the browser window shrinks', () => {
    let view = { width: 1000, height: 700 };
    const { result } = setup({ viewport: () => view, initial: { width: 400, height: 300, x: 590, y: 390 } });
    expect(result.current.geometry).toMatchObject({ x: 590, y: 390 });
    view = { width: 700, height: 500 };
    act(() => void fireEvent(window, new Event('resize')));
    expect(result.current.geometry).toEqual({ x: 300, y: 200, width: 400, height: 300 });
  });

  it('uses the real window and localStorage by default', () => {
    const { result } = renderHook(() => useFloatingPanel({ storageKey: 'panel-default', initial: { width: 400, height: 300, x: 10, y: 10 }, limits: LIMITS }));
    expect(result.current.geometry).toEqual({ x: 10, y: 10, width: 400, height: 300 });
    localStorage.removeItem('panel-default');
  });

  it('works when the browser blocks localStorage altogether', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      const { result } = renderHook(() => useFloatingPanel({ storageKey: 'p', initial: { width: 400, height: 300, x: 10, y: 10 }, limits: LIMITS }));
      expect(result.current.geometry).toEqual({ x: 10, y: 10, width: 400, height: 300 });
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('removes its window listener when it unmounts', () => {
    const remove = jest.spyOn(window, 'removeEventListener');
    const { unmount } = setup();
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    remove.mockRestore();
  });
});
