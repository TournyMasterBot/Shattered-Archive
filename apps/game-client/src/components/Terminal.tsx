// apps/game-client/src/components/Terminal.tsx
import React from 'react';
import '@xterm/xterm/css/xterm.css';
import styles from '../styles/Terminal.module.scss';
import { useTerminal } from '../hooks/useTerminal';
import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';

export const Terminal: React.FC = () => {
  const { containerRef, showJump, handleJumpToLive } = useTerminal();

  const downPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const didDragRef = React.useRef(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;

    const scheduleFit = () => {
      if (raf) return;

      raf = window.requestAnimationFrame(() => {
        raf = 0;

        if (el.clientWidth < 50 || el.clientHeight < 50) {
          scheduleFit();
          return;
        }

        ShatteredArchiveTerminal.Instance.Fit();
      });
    };

    const fitAfterFonts = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fonts: any = (document as any).fonts;
        if (fonts?.ready) {
          await fonts.ready;
        }
      } catch {
        // ignore
      }

      scheduleFit();
      window.setTimeout(() => scheduleFit(), 50);
      window.setTimeout(() => scheduleFit(), 250);
    };

    fitAfterFonts();

    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    const onWindowResize = () => scheduleFit();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
      ro.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [containerRef]);

  // ✅ Touch drag-scroll + inertia: xterm doesn’t use native scrollTop; use terminal.scrollLines(...)
  React.useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const getXtermScrollable = (): HTMLElement | null =>
      host.querySelector('.xterm-scrollable-element') as HTMLElement | null;

    const getRowHeightPx = (): number => {
      const row = host.querySelector('.xterm-rows > div') as HTMLDivElement | null;
      if (row) {
        const h = row.getBoundingClientRect().height;
        if (h && Number.isFinite(h) && h > 4) return h;
      }

      const rows = host.querySelector('.xterm-rows') as HTMLElement | null;
      if (rows) {
        const cs = window.getComputedStyle(rows);
        const fs = parseFloat(cs.fontSize || '16');
        const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight || `${fs * 1.2}`);
        if (Number.isFinite(lh) && lh > 4) return lh;
      }

      return 18;
    };

    // Obtain xterm instance safely (adjust property if your wrapper differs)
    const getTerm = (): any => {
      return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ShatteredArchiveTerminal as any).Instance?.Terminal ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ShatteredArchiveTerminal as any).Instance?.term
      );
    };

    const scrollByPx = (px: number, rowH: number, carryRef: { v: number }) => {
      // carryRef.v stores carryPx remainder between calls
      carryRef.v += px;

      const lines = (carryRef.v / rowH) | 0; // trunc toward zero
      if (lines !== 0) {
        const term = getTerm();
        if (term && typeof term.scrollLines === 'function') {
          // px positive means finger moved down -> scroll up -> negative lines
          term.scrollLines(-lines);
        }
        carryRef.v -= lines * rowH;
      }
    };

    let active = false;
    let lastY = 0;
    let lastT = 0;

    // inertia state
    let inertiaRaf = 0;
    let velocityPxPerMs = 0; // positive = finger moving down
    const carry = { v: 0 }; // carryPx remainder
    let rowH = 18;

    const stopInertia = () => {
      if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
      inertiaRaf = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      const scrollable = getXtermScrollable();
      if (!scrollable) return;

      const target = e.target as HTMLElement | null;
      if (!target || !scrollable.contains(target)) return;

      stopInertia();

      active = true;
      lastY = e.clientY;
      lastT = performance.now();
      velocityPxPerMs = 0;
      carry.v = 0;
      rowH = getRowHeightPx();

      try {
        scrollable.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return;
      if (e.pointerType !== 'touch') return;

      const y = e.clientY;
      const now = performance.now();

      const dy = y - lastY;
      const dt = Math.max(1, now - lastT);

      // Low-pass filter velocity for smoother fling
      const instantV = dy / dt; // px/ms
      velocityPxPerMs = velocityPxPerMs * 0.8 + instantV * 0.2;

      // Drag: finger down should scroll up (we handle inversion inside scrollByPx via -lines)
      scrollByPx(dy, rowH, carry);

      lastY = y;
      lastT = now;

      e.preventDefault();
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (!active) return;
      if (e.pointerType !== 'touch') return;

      active = false;

      const scrollable = getXtermScrollable();
      if (scrollable) {
        try {
          scrollable.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      // If velocity is tiny, stop
      if (Math.abs(velocityPxPerMs) < 0.02) {
        e.preventDefault();
        return;
      }

      // Inertia: exponential decay
      const friction = 0.006; // higher = stops sooner
      let last = performance.now();

      const step = () => {
        const now = performance.now();
        const dt = now - last;
        last = now;

        // scroll by velocity * dt
        scrollByPx(velocityPxPerMs * dt, rowH, carry);

        // decay
        const decay = Math.exp(-friction * dt);
        velocityPxPerMs *= decay;

        if (Math.abs(velocityPxPerMs) < 0.02) {
          inertiaRaf = 0;
          return;
        }

        inertiaRaf = requestAnimationFrame(step);
      };

      inertiaRaf = requestAnimationFrame(step);
      e.preventDefault();
    };

    const scrollable = getXtermScrollable();
    if (!scrollable) return;

    scrollable.addEventListener('pointerdown', onPointerDown, { passive: false });
    scrollable.addEventListener('pointermove', onPointerMove, { passive: false });
    scrollable.addEventListener('pointerup', onPointerUpOrCancel, { passive: false });
    scrollable.addEventListener('pointercancel', onPointerUpOrCancel, { passive: false });

    return () => {
      stopInertia();
      scrollable.removeEventListener('pointerdown', onPointerDown as any);
      scrollable.removeEventListener('pointermove', onPointerMove as any);
      scrollable.removeEventListener('pointerup', onPointerUpOrCancel as any);
      scrollable.removeEventListener('pointercancel', onPointerUpOrCancel as any);
    };
  }, [containerRef]);

  const focusCommandInput = () => {
    const input = document.getElementById('game-command-input') as HTMLInputElement | null;
    input?.focus();
  };

  return (
    <div
      className={styles.playAreaTerminalWrapper}
      onPointerDownCapture={(e) => {
        // Mouse/pen: preserve “tap to focus vs drag”
        if (e.pointerType === 'touch') return;
        downPosRef.current = { x: e.clientX, y: e.clientY };
        didDragRef.current = false;
      }}
      onPointerMoveCapture={(e) => {
        if (e.pointerType === 'touch') return;
        if (!downPosRef.current) return;

        const dx = Math.abs(e.clientX - downPosRef.current.x);
        const dy = Math.abs(e.clientY - downPosRef.current.y);

        if (dx > 3 || dy > 3) didDragRef.current = true;
      }}
      onPointerUpCapture={(e) => {
        if (e.pointerType === 'touch') return;

        if (!didDragRef.current) focusCommandInput();
        downPosRef.current = null;
        didDragRef.current = false;
      }}
    >
      <div id="play-area-terminal-root" ref={containerRef} className={styles.playAreaTerminal} />

      {showJump && (
        <button
          id="play-area-terminal-jump-to-live"
          className={styles.playAreaTerminalJump}
          type="button"
          onClick={handleJumpToLive}
        >
          Jump to Live
        </button>
      )}
    </div>
  );
};

export default Terminal;
