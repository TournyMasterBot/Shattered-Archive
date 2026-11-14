import { act, render } from '@testing-library/react';
import React from 'react';
import { DEFAULT_LIMITS, clampSize, parseSize, useResizableModal, type ResizableModal, type ResizableModalOptions } from './useResizableModal';

const VIEW = { width: 1000, height: 700 };
const LIMITS = { minWidth: 300, minHeight: 200 };

class Store {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

/** The modal's current box: 400 x 300 with its top-left corner at (100, 50). */
const RECT = { left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON: () => ({}) } as DOMRect;
let rectSpy: jest.SpyInstance;
beforeEach(() => {
  rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});
afterEach(() => rectSpy.mockRestore());

interface Mounted {
  hook: { current: ResizableModal };
  box: HTMLElement;
  storage: Store;
  unmount: () => void;
}

function mount(over: Partial<ResizableModalOptions> = {}, storage = new Store()): Mounted {
  const hook = { current: undefined as unknown as ResizableModal };
  const Probe: React.FC = () => {
    const resizable = useResizableModal({ storageKey: 'modal', limits: LIMITS, storage, viewport: () => VIEW, ...over });
    hook.current = resizable;
    return <div ref={resizable.attach} data-testid="box" style={resizable.style} />;
  };
  const view = render(<Probe />);
  return { hook, box: view.container.firstElementChild as HTMLElement, storage, unmount: view.unmount };
}

const pointer = (type: 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number) =>
  act(() => void document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })));
const grab = (m: Mounted, x: number, y: number, extra: Record<string, unknown> = {}) => {
  const event = { clientX: x, clientY: y, button: 0, preventDefault: jest.fn(), stopPropagation: jest.fn(), ...extra };
  act(() => m.hook.current.gripProps.onPointerDown(event as unknown as React.PointerEvent<HTMLElement>));
  return event;
};
const sizeOf = (m: Mounted) => ({ width: m.box.style.width, height: m.box.style.height });

describe('clampSize and parseSize', () => {
  it('keeps a size between the minimum and the room, and a room smaller than the minimum wins', () => {
    expect(clampSize({ width: 100, height: 100 }, VIEW, LIMITS)).toEqual({ width: 300, height: 200 });
    expect(clampSize({ width: 5000, height: 5000 }, VIEW, LIMITS)).toEqual({ width: 1000, height: 700 });
    expect(clampSize({ width: 450.6, height: 300.4 }, VIEW, LIMITS)).toEqual({ width: 451, height: 300 });
    expect(clampSize({ width: 500, height: 500 }, { width: 200, height: 100 }, LIMITS)).toEqual({ width: 200, height: 100 });
    expect(clampSize({ width: Number.NaN, height: Number.POSITIVE_INFINITY }, VIEW, LIMITS)).toEqual({ width: 300, height: 200 }); // not a number: the minimum
    expect(clampSize({ width: 500, height: 500 }, { width: 0, height: 0 }, LIMITS)).toEqual({ width: 1, height: 1 });
  });

  it('reads a stored size only when it is two finite numbers', () => {
    expect(parseSize(JSON.stringify({ width: 500, height: 400 }))).toEqual({ width: 500, height: 400 });
    for (const bad of [null, 'not json', '{}', JSON.stringify({ width: 500 }), JSON.stringify({ width: 'a', height: 4 }), JSON.stringify({ width: null, height: 4 })]) {
      expect(parseSize(bad)).toBeUndefined();
    }
  });

  it('has a default minimum for a modal that gives none', () => {
    expect(DEFAULT_LIMITS).toEqual({ minWidth: 360, minHeight: 240 });
  });
});

describe('useResizableModal', () => {
  it('leaves a modal that was never resized exactly as its style sheet draws it', () => {
    const m = mount();
    expect(m.hook.current.style).toEqual({});
    // no size of its own; only the position that lets the grip sit in its corner
    expect(m.box.style.width).toBe('');
    expect(m.box.style.height).toBe('');
    expect(m.box.style.overflow).toBe('');
  });

  it('uses a default minimum when the modal gives none', () => {
    const m = mount({ limits: undefined });
    grab(m, 500, 350);
    pointer('pointermove', 0, 0);
    expect(sizeOf(m)).toEqual({ width: `${DEFAULT_LIMITS.minWidth}px`, height: `${DEFAULT_LIMITS.minHeight}px` });
  });

  it('drags the bottom-right corner: the size follows the pointer from the modal size it had, and the top-left stays', () => {
    const m = mount();
    grab(m, 500, 350);
    pointer('pointermove', 560, 400);
    expect(sizeOf(m)).toEqual({ width: '460px', height: '350px' });
    expect(m.box.style.maxWidth).toBe('none'); // the style sheet's cap would otherwise win
    expect(m.box.style.overflow).toBe('auto');
    pointer('pointermove', 520, 330);
    expect(sizeOf(m)).toEqual({ width: '420px', height: '280px' });
  });

  it('never grows past the screen edge from the fixed corner, nor below the minimum', () => {
    const m = mount();
    grab(m, 500, 350);
    pointer('pointermove', 9000, 9000);
    expect(sizeOf(m)).toEqual({ width: '900px', height: '650px' }); // 1000 - 100 left, 700 - 50 top
    pointer('pointermove', -9000, -9000);
    expect(sizeOf(m)).toEqual({ width: '300px', height: '200px' });
  });

  it('a centered modal grows on both sides at once: the pointer moves its corner by half as much, up to the whole screen', () => {
    const m = mount({ centered: true });
    grab(m, 500, 350);
    pointer('pointermove', 530, 360);
    expect(sizeOf(m)).toEqual({ width: '460px', height: '320px' }); // 30 and 10 of pointer = 60 and 20 of size
    pointer('pointermove', 9000, 9000);
    expect(sizeOf(m)).toEqual({ width: '1000px', height: '700px' });
  });

  it('saves the size when the drag ends, and the next mount starts from it', () => {
    const first = mount();
    grab(first, 500, 350);
    pointer('pointermove', 560, 400);
    expect(first.storage.data.size).toBe(0); // nothing is written while dragging
    pointer('pointerup', 560, 400);
    expect(JSON.parse(first.storage.data.get('modal') as string)).toEqual({ width: 460, height: 350 });
    first.unmount();

    const second = mount({}, first.storage);
    expect(sizeOf(second)).toEqual({ width: '460px', height: '350px' });
    // and a later drag starts from the stored size, not from the style sheet's
    grab(second, 500, 350);
    pointer('pointermove', 510, 350);
    expect(sizeOf(second)).toEqual({ width: '470px', height: '350px' });
  });

  it('a stored size from a bigger screen is pulled back inside this one', () => {
    const storage = new Store();
    storage.setItem('modal', JSON.stringify({ width: 4000, height: 3000 }));
    expect(sizeOf(mount({}, storage))).toEqual({ width: '1000px', height: '700px' });
  });

  it('stops following the pointer after the drag ends or is cancelled, and a cancel saves too', () => {
    const m = mount();
    grab(m, 500, 350);
    pointer('pointermove', 560, 400);
    pointer('pointerup', 560, 400);
    pointer('pointermove', 700, 600);
    expect(sizeOf(m)).toEqual({ width: '460px', height: '350px' });

    const c = mount();
    grab(c, 500, 350);
    pointer('pointermove', 520, 360);
    pointer('pointercancel', 520, 360);
    pointer('pointermove', 900, 600);
    expect(sizeOf(c)).toEqual({ width: '420px', height: '310px' });
    expect(c.storage.data.has('modal')).toBe(true);
  });

  it('ignores a press that is not the primary button, and one on a modal that is gone; a press is not also a drag of the window around it', () => {
    const m = mount();
    grab(m, 500, 350, { button: 2 });
    pointer('pointermove', 600, 400);
    expect(m.hook.current.style).toEqual({});

    const event = grab(m, 500, 350);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    pointer('pointerup', 500, 350);

    const gone = mount();
    gone.unmount();
    const event2 = grab(gone, 500, 350);
    expect(event2.preventDefault).not.toHaveBeenCalled();
  });

  it('accepts a press with no button number (a touch), and survives storage that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const m = mount({ storage: blocked });
    grab(m, 500, 350, { button: undefined });
    pointer('pointermove', 520, 360);
    pointer('pointerup', 520, 360);
    expect(sizeOf(m)).toEqual({ width: '420px', height: '310px' }); // the size lasts until the page closes
  });

  it('pulls a resized modal back inside when the browser window shrinks, and leaves one that was never resized alone', () => {
    let view = VIEW;
    const resized = mount({ viewport: () => view });
    grab(resized, 500, 350);
    pointer('pointermove', 900, 600);
    pointer('pointerup', 900, 600);
    expect(sizeOf(resized)).toEqual({ width: '800px', height: '550px' });
    view = { width: 600, height: 400 };
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(sizeOf(resized)).toEqual({ width: '600px', height: '400px' });

    const untouched = mount({ viewport: () => view });
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(untouched.hook.current.style).toEqual({});
  });

  it('makes a root that is not positioned a positioning context for the grip, and leaves a positioned one alone', () => {
    const plain = mount();
    expect(plain.box.style.position).toBe('relative');

    expect(hookWithPosition('fixed').style.position).toBe('fixed');
    expect(hookWithPosition('absolute').style.position).toBe('absolute');
  });

  it('uses the browser localStorage and window size when none are given, and carries on when the browser blocks storage', () => {
    const Probe: React.FC<{ onHook: (r: ResizableModal) => void }> = ({ onHook }) => {
      const r = useResizableModal({ storageKey: 'defaults', limits: LIMITS });
      onHook(r);
      return <div ref={r.attach} />;
    };
    localStorage.setItem('defaults', JSON.stringify({ width: 5000, height: 5000 }));
    let seen!: ResizableModal;
    render(<Probe onHook={(r) => (seen = r)} />);
    expect(seen.style).toMatchObject({ width: window.innerWidth, height: window.innerHeight }); // the stored size, pulled inside this window
    localStorage.clear();

    const blocked = jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      render(<Probe onHook={(r) => (seen = r)} />);
      expect(seen.style).toEqual({}); // no stored size, no crash
    } finally {
      blocked.mockRestore();
    }
  });
});

function hookWithPosition(position: React.CSSProperties['position']): HTMLElement {
  const Probe: React.FC = () => {
    const resizable = useResizableModal({ storageKey: 'p', limits: LIMITS, storage: new Store(), viewport: () => VIEW });
    return <div ref={resizable.attach} data-testid="pos" style={{ position }} />;
  };
  return render(<Probe />).container.firstElementChild as HTMLElement;
}
