import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The stack of open modals and floating windows. One stack for all of them, so the order they were opened (or last dragged or clicked)
 * is both what is drawn on top and what the Escape key closes first.
 */
interface Layer {
  /** The handler of the latest render, so a changed closure never changes the layer's place in the stack. */
  onEscape: () => void;
}

/** The z-index of the bottom layer. Above the menu bar (3000) and the HUD; each layer above it is one higher. */
export const WINDOW_BASE_Z = 5000;

let layers: Layer[] = [];
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Escape closes the top-most window only (one press, one window), unless something inside already used the key. */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
  // the listener exists only while a window is open, so there is a top one
  event.preventDefault();
  layers[layers.length - 1].onEscape();
}

function add(layer: Layer): void {
  if (layers.length === 0) document.addEventListener('keydown', onKeyDown);
  layers = [...layers, layer];
  emit();
}

function remove(layer: Layer): void {
  layers = layers.filter((l) => l !== layer);
  if (layers.length === 0) document.removeEventListener('keydown', onKeyDown);
  emit();
}

function raise(layer: Layer): void {
  if (layers[layers.length - 1] === layer || !layers.includes(layer)) return;
  layers = [...layers.filter((l) => l !== layer), layer];
  emit();
}

export interface WindowLayer {
  /** The z-index to draw this window at: above every window that was opened, dragged or clicked before it. */
  zIndex: number;
  /** Put this window on top. Call it when a drag starts and on any press inside the window. */
  bringToFront: () => void;
}

/**
 * Registers a modal or window while `open`, and returns where to draw it.
 * - A window that opens goes on top. `bringToFront` moves it back to the top (a drag, a click).
 * - The Escape key calls `onEscape` of the top-most window only. Pass the same handler as the close button, so a window that asks
 *   before closing asks the same way. A key press that something inside the window already handled (it called `preventDefault` or
 *   `stopPropagation`, as an open dropdown does) never reaches it.
 * Call it before the component's early `return null`: a hook cannot be skipped.
 */
export function useWindowLayer(options: { open: boolean; onEscape: () => void }): WindowLayer {
  const { open, onEscape } = options;
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  const layer = useRef<Layer>({ onEscape: () => handler.current() });

  // before paint, so a window that opens is never drawn once at the wrong height
  useLayoutEffect(() => {
    if (!open) return undefined;
    const mine = layer.current;
    add(mine);
    return () => remove(mine);
  }, [open]);

  // a layer that is not registered yet will be added on top
  const place = useSyncExternalStore(subscribe, () => {
    const index = layers.indexOf(layer.current);
    return index < 0 ? layers.length : index;
  });
  const bringToFront = useCallback(() => raise(layer.current), []);
  return { zIndex: WINDOW_BASE_Z + place, bringToFront };
}

/** Test helper: how many windows are open. */
export function openWindowCount(): number {
  return layers.length;
}
