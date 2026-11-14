import { useCallback, useEffect, useRef, useState } from 'react';

export interface ModalSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ModalLimits {
  minWidth: number;
  minHeight: number;
}

/** A modal that is not resized keeps the size its style sheet gives it; the first resize stores one. */
export const DEFAULT_LIMITS: ModalLimits = { minWidth: 360, minHeight: 240 };

/** The size inside [minimum, room] on each side. A room smaller than the minimum wins (the modal shrinks to fit rather than leave the screen). */
export function clampSize(size: ModalSize, room: ModalSize, limits: ModalLimits): ModalSize {
  const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);
  const fit = (value: number, min: number, max: number): number => Math.round(Math.min(Math.max(finite(value, min), min), Math.max(max, 1)));
  return { width: fit(size.width, limits.minWidth, room.width), height: fit(size.height, limits.minHeight, room.height) };
}

/** A stored size, or undefined when it is missing or not two numbers. */
export function parseSize(text: string | null): ModalSize | undefined {
  if (text === null) return undefined;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    return typeof v.width === 'number' && Number.isFinite(v.width) && typeof v.height === 'number' && Number.isFinite(v.height)
      ? { width: v.width, height: v.height }
      : undefined;
  } catch {
    return undefined;
  }
}

export interface ResizableModalOptions {
  /** localStorage key of the size. */
  storageKey: string;
  limits?: ModalLimits;
  /**
   * The modal is centered by the page (an overlay modal): it grows on both sides at once, so the pointer moves twice as far as the
   * corner does, and the corner is moved by half. Otherwise the top-left corner stays and the bottom-right follows the pointer.
   */
  centered?: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  viewport?: () => Viewport;
}

export interface ResizableModal {
  /**
   * Put on the modal's root element as its `ref`. A callback, not a ref object: it lets the hook own the element without a ref value
   * ever being read while rendering. A root that is not positioned is made `position: relative` here, so the grip can sit in its corner.
   */
  attach: (element: HTMLDivElement | null) => void;
  /** Merge into the root's style: empty until the first resize (the style sheet's size stays), then the size. */
  style: React.CSSProperties;
  /** Spread on `<ResizeGrip />`. */
  gripProps: { onPointerDown: (event: React.PointerEvent<HTMLElement>) => void };
}

/** A root with one of these already has the positioning context the grip needs. */
const POSITIONED = ['fixed', 'absolute', 'relative', 'sticky'];

const defaultViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });
/** Touching localStorage can throw in a browser that blocks it. */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Makes a modal resizable by a corner grip, as the Copilot window is: dragged, clamped to the screen and to a minimum, saved when the
 * drag ends and restored on the next open. A modal that was never resized is left exactly as its style sheet draws it. Pointer events,
 * so a mouse, a pen and a finger all work.
 */
export function useResizableModal(options: ResizableModalOptions): ResizableModal {
  const { storageKey, centered = false } = options;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const viewportOf = options.viewport ?? defaultViewport;
  const storage = options.storage ?? defaultStorage();
  const element = useRef<HTMLDivElement | null>(null);
  const attach = useCallback((next: HTMLDivElement | null) => {
    element.current = next;
    // the grip is placed against the root's corner, so the root must be a positioning context
    if (next !== null && !POSITIONED.includes(getComputedStyle(next).position)) next.style.position = 'relative';
  }, []);

  const [size, setSize] = useState<ModalSize | undefined>(() => {
    let saved: ModalSize | undefined;
    try {
      saved = parseSize(storage?.getItem(storageKey) ?? null);
    } catch {
      saved = undefined; // blocked storage: the style sheet's size
    }
    return saved === undefined ? undefined : clampSize(saved, viewportOf(), limits);
  });
  const latest = useRef(size);
  useEffect(() => {
    latest.current = size;
  }, [size]);

  // a smaller browser window pulls a resized modal back inside
  useEffect(() => {
    const onResize = (): void => setSize((s) => (s === undefined ? s : clampSize(s, viewportOf(), limits)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [limits, viewportOf]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== undefined && event.button !== 0) return; // the primary button only
      const root = element.current;
      if (root === null) return;
      event.preventDefault(); // no text selection while dragging
      event.stopPropagation(); // not a drag of the window the grip sits in
      const rect = root.getBoundingClientRect();
      const start: ModalSize = latest.current ?? { width: rect.width, height: rect.height };
      const view = viewportOf();
      // the most room: to the screen's edge from the fixed corner, or the whole screen for a centered modal
      const room: ModalSize = centered ? view : { width: view.width - rect.left, height: view.height - rect.top };
      const factor = centered ? 2 : 1;
      const originX = event.clientX;
      const originY = event.clientY;
      const onMove = (ev: PointerEvent): void => {
        setSize(clampSize({ width: start.width + (ev.clientX - originX) * factor, height: start.height + (ev.clientY - originY) * factor }, room, limits));
      };
      const onUp = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        try {
          if (latest.current !== undefined) storage?.setItem(storageKey, JSON.stringify(latest.current));
        } catch {
          // blocked storage: the size lasts until the page closes
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [centered, limits, storage, storageKey, viewportOf],
  );

  const style: React.CSSProperties =
    size === undefined ? {} : { width: size.width, height: size.height, maxWidth: 'none', maxHeight: 'none', boxSizing: 'border-box', overflow: 'auto' };
  return { attach, style, gripProps: { onPointerDown } };
}
