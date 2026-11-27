import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PanelLimits {
  minWidth: number;
  minHeight: number;
}

/**
 * Keep a panel entirely inside the viewport and at least its minimum size. A viewport smaller than the minimum wins (the panel
 * shrinks to fit rather than leave the screen), and every number is rounded and finite.
 */
export function clampGeometry(geometry: PanelGeometry, viewport: Viewport, limits: PanelLimits): PanelGeometry {
  const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);
  const width = Math.round(Math.min(Math.max(finite(geometry.width, limits.minWidth), limits.minWidth), viewport.width));
  const height = Math.round(Math.min(Math.max(finite(geometry.height, limits.minHeight), limits.minHeight), viewport.height));
  const x = Math.round(Math.min(Math.max(finite(geometry.x, 0), 0), viewport.width - width));
  const y = Math.round(Math.min(Math.max(finite(geometry.y, 0), 0), viewport.height - height));
  return { x, y, width, height };
}

/** A stored geometry, or undefined when it is missing or not four numbers. */
export function parseGeometry(text: string | null): PanelGeometry | undefined {
  if (text === null) return undefined;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    const { x, y, width, height } = v;
    return [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))
      ? { x: x as number, y: y as number, width: width as number, height: height as number }
      : undefined;
  } catch {
    return undefined;
  }
}

export interface FloatingPanelOptions {
  /** localStorage key for the geometry. */
  storageKey: string;
  /** Used when nothing is stored: the size, and where the top-left goes (undefined: top-right with a margin). */
  initial: { width: number; height: number; x?: number; y?: number };
  limits: PanelLimits;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  viewport?: () => Viewport;
}

const MARGIN = 16;
const defaultViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });
/** Touching localStorage can throw in a browser that blocks it. */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export interface FloatingPanel {
  geometry: PanelGeometry;
  /** Put on the header: drag moves the panel. Presses on a button or other control do not start a drag. */
  onHeaderPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  /** Put on the corner handle: drag resizes the panel. */
  onResizePointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * A draggable, resizable panel with no backdrop and no focus handling, so the page behind it stays usable. It is clamped to the
 * viewport at all times (also when the browser window shrinks), and the geometry is saved when a drag ends and restored (clamped)
 * on the next open. Pointer events, so a mouse, a pen and a finger all work.
 */
export function useFloatingPanel(options: FloatingPanelOptions): FloatingPanel {
  const { storageKey, limits } = options;
  const viewportOf = options.viewport ?? defaultViewport;
  const storage = options.storage ?? defaultStorage();

  const [geometry, setGeometry] = useState<PanelGeometry>(() => {
    const view = viewportOf();
    let saved: PanelGeometry | undefined;
    try {
      saved = parseGeometry(storage?.getItem(storageKey) ?? null);
    } catch {
      saved = undefined; // blocked storage: start from the defaults
    }
    const start = saved ?? {
      width: options.initial.width,
      height: options.initial.height,
      x: options.initial.x ?? view.width - options.initial.width - MARGIN,
      y: options.initial.y ?? MARGIN * 4,
    };
    return clampGeometry(start, view, limits);
  });

  const latest = useRef(geometry);
  useEffect(() => {
    latest.current = geometry;
  }, [geometry]);

  const persist = useCallback(() => {
    try {
      storage?.setItem(storageKey, JSON.stringify(latest.current));
    } catch {
      // blocked storage: the geometry lasts until the page closes
    }
  }, [storage, storageKey]);

  // A smaller browser window pulls the panel back inside.
  useEffect(() => {
    const onResize = (): void => setGeometry((g) => clampGeometry(g, viewportOf(), limits));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [limits, viewportOf]);

  const track = useCallback(
    (event: React.PointerEvent<HTMLElement>, apply: (dx: number, dy: number, start: PanelGeometry) => PanelGeometry) => {
      if (event.button !== undefined && event.button !== 0) return; // the primary button only
      event.preventDefault(); // no text selection while dragging
      const start = latest.current;
      const originX = event.clientX;
      const originY = event.clientY;
      const onMove = (ev: PointerEvent): void => {
        setGeometry(clampGeometry(apply(ev.clientX - originX, ev.clientY - originY, start), viewportOf(), limits));
      };
      const onUp = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        persist();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [limits, persist, viewportOf],
  );

  const onHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('button, select, input, textarea, a')) return;
      track(event, (dx, dy, start) => ({ ...start, x: start.x + dx, y: start.y + dy }));
    },
    [track],
  );

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // growing stops at the viewport edge instead of shoving the panel sideways to make room
      track(event, (dx, dy, start) => {
        const view = viewportOf();
        return { ...start, width: Math.min(start.width + dx, view.width - start.x), height: Math.min(start.height + dy, view.height - start.y) };
      });
    },
    [track, viewportOf],
  );

  return { geometry, onHeaderPointerDown, onResizePointerDown };
}
