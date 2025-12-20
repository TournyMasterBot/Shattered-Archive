// apps/game-client/src/components/CompassBlockMobile.tsx
import React from 'react';
import styles from '../styles/CompassBlock.module.scss';
import { useCompassBlock, CompassDirection } from '../hooks/useCompassBlock';

const ORDER: CompassDirection[] = ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE', 'U', 'D'];

export const CompassBlockMobile: React.FC = () => {
  const { hasExit, move } = useCompassBlock();

  const refocusInput = () => {
    const input = document.getElementById('game-command-input') as HTMLInputElement | null;
    input?.focus();
  };

  return (
    <div
      className={styles.mobileWide}
      // 🚨 CRITICAL: prevent container from stealing focus when user misses a button
      onPointerDownCapture={(e) => {
        e.preventDefault();
      }}
      onTouchStartCapture={(e) => {
        e.preventDefault();
      }}
      onMouseDownCapture={(e) => {
        e.preventDefault();
      }}
      // Safety net: if anything did blur, restore focus
      onClick={() => {
        queueMicrotask(refocusInput);
      }}
    >
      {ORDER.map((dir) => {
        const enabled = hasExit(dir);

        return (
          <button
            key={dir}
            type="button"
            className={`${styles.mobileWideBtn} ${
              enabled ? styles.mobileWideBtnAvailable : styles.mobileWideBtnDisabled
            }`}
            aria-disabled={!enabled}
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault(); // keep keyboard open
            }}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (enabled) move(dir);
              queueMicrotask(refocusInput);
            }}
          >
            {dir}
          </button>
        );
      })}
    </div>
  );
};

export default CompassBlockMobile;
