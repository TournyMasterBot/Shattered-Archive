// apps/game-client/src/components/Terminal.tsx
import React from 'react';
import '@xterm/xterm/css/xterm.css';
import styles from '../styles/Terminal.module.scss';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal: React.FC = () => {
  const { containerRef, showJump, handleJumpToLive } = useTerminal();

  return (
    <div
      className={styles.playAreaTerminalWrapper}
      onPointerDownCapture={(e) => {
        // Prevent xterm from focusing its hidden textarea (keyboard on mobile).
        // Capture ensures we win before xterm handlers.
        e.preventDefault();
      }}
      onTouchStartCapture={(e) => {
        // Some Android browsers still need touchstart.
        e.preventDefault();
      }}
      onClick={() => {
        // Optional: tap terminal => focus command input
        const input = document.getElementById('game-command-input') as HTMLInputElement | null;
        input?.focus();
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
