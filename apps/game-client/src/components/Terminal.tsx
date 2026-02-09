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
      // On hard refresh, fonts may not be ready when xterm measures,
      // so the canvas can render at a smaller “fallback” metric.
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

      // One extra delayed fit helps with late font swaps / layout settle.
      window.setTimeout(() => scheduleFit(), 50);
      window.setTimeout(() => scheduleFit(), 250);
    };

    fitAfterFonts();

    const ro = new ResizeObserver(() => scheduleFit());
    ro.observe(el);

    if (el.parentElement) {
      ro.observe(el.parentElement);
    }

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

  const focusCommandInput = () => {
    const input = document.getElementById('game-command-input') as HTMLInputElement | null;
    input?.focus();
  };

  return (
    <div
      className={styles.playAreaTerminalWrapper}
      onPointerDownCapture={(e) => {
        downPosRef.current = { x: e.clientX, y: e.clientY };
        didDragRef.current = false;
      }}
      onPointerMoveCapture={(e) => {
        if (!downPosRef.current) return;

        const dx = Math.abs(e.clientX - downPosRef.current.x);
        const dy = Math.abs(e.clientY - downPosRef.current.y);

        if (dx > 3 || dy > 3) {
          didDragRef.current = true;
        }
      }}
      onPointerUpCapture={() => {
        if (!didDragRef.current) {
          focusCommandInput();
        }

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
